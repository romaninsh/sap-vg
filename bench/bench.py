#!/usr/bin/env python3
"""Rollup-query benchmark: SurrealDB vs PostgreSQL vs SQLite on the same data.

The queries are the ones the ERP's pages send: a page of sales orders with per-order totals,
the same over every order, sorting by a computed total, and "overdue invoices" (amount > paid).
SurrealDB runs them two ways:
  surreal-parent  correlated subquery `(SELECT … FROM line WHERE sales_order = $parent.id)`, FK indexed
  surreal-refs    record references `<~line` (fields declared REFERENCE), what the app now uses
PostgreSQL and SQLite run the plain SQL correlated subquery with the same indexes.

Timings are the engine's own: SurrealDB's per-statement `time`, psql `\\timing`, SQLite in-process.
Each query: one warm-up, then RUNS timed runs; the median is reported. A query whose warm-up
takes longer than SLOW_S runs once (marked *).

Data lives apart from the app: SurrealDB namespace `bench` (databases `parent`, `refs`), a
throwaway Postgres container (bench/compose.yaml, tmpfs), and data/bench.sqlite.

usage: python3 -I bench/bench.py [orders ...]      default: 1000 4000 10000
"""
import json, os, random, sqlite3, statistics, subprocess, sys, time, urllib.request, base64
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_STACK = "vantage-dev-erp-vg-609e1c378d25b9b8"
RUNS, SLOW_S = 5, 8.0
# The correlated-subquery form grows with orders × lines; past this size the whole-table queries
# would take many minutes each, so only the LIMIT-ed page and the point lookup run.
PARENT_MAX = 5000
WHOLE_TABLE = {"all_orders_with_totals", "page_40_by_total", "overdue_invoices"}


# ───────────── data ─────────────
def make_data(n_orders, seed=7):
    r = random.Random(seed)
    t0 = datetime(2025, 1, 1, tzinfo=timezone.utc)
    now = datetime(2026, 11, 4, tzinfo=timezone.utc)
    span = (now - t0).total_seconds()
    customers = [(f"c{i}", f"Customer {i:04d}") for i in range(max(50, n_orders // 20))]
    orders, lines, invoices, payments = [], [], [], []
    for i in range(n_orders):
        od = t0 + timedelta(seconds=span * i / n_orders)
        status = r.choices(["shipped", "confirmed", "draft", "cancelled"], [85, 8, 5, 2])[0]
        oid = f"o{i}"
        orders.append((oid, r.choice(customers)[0], od, status))
        total = 0
        for j in range(r.choice([1, 2, 2, 3, 3, 4])):
            qty = r.randint(1, 20)
            amount = qty * r.choice([2900, 6400, 12900, 39000, 79000])
            total += amount
            lines.append((f"l{i}_{j}", oid, f"p{r.randint(1, 30)}", qty, amount))
        if status == "shipped" and r.random() < 0.92:
            due = od + timedelta(days=30)
            ist = "void" if r.random() < 0.02 else "issued"
            iid = f"i{i}"
            invoices.append((iid, oid, orders[-1][1], total, ist, due))
            if ist == "issued" and (due < now or r.random() < 0.3):
                x = r.random()
                if x < 0.85:
                    payments.append((f"p{i}", iid, total))
                elif x < 0.92:
                    payments.append((f"p{i}", iid, total // 2))
    return dict(customer=customers, sales_order=orders, line=lines, invoice=invoices, payment=payments)


def iso(d):
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


# ───────────── queries ─────────────
SQL = {
    "page_40_by_date": """SELECT o.id, o.order_date,
        (SELECT COALESCE(SUM(l.amount), 0) FROM line l WHERE l.sales_order = o.id) AS total,
        (SELECT COUNT(*) FROM line l WHERE l.sales_order = o.id) AS n,
        (SELECT COUNT(*) FROM invoice i WHERE i.sales_order = o.id AND i.status <> 'void') > 0 AS invoiced
      FROM sales_order o ORDER BY o.order_date DESC LIMIT 40""",
    "all_orders_with_totals": """SELECT o.id,
        (SELECT COALESCE(SUM(l.amount), 0) FROM line l WHERE l.sales_order = o.id) AS total,
        (SELECT COUNT(*) FROM line l WHERE l.sales_order = o.id) AS n,
        (SELECT COUNT(*) FROM invoice i WHERE i.sales_order = o.id AND i.status <> 'void') > 0 AS invoiced
      FROM sales_order o""",
    "page_40_by_total": """SELECT o.id, (SELECT COALESCE(SUM(l.amount), 0) FROM line l WHERE l.sales_order = o.id) AS total
      FROM sales_order o ORDER BY total DESC LIMIT 40""",
    "overdue_invoices": """SELECT i.id FROM invoice i
      WHERE i.status = 'issued' AND i.due_on < '2026-11-04'
        AND i.amount > (SELECT COALESCE(SUM(p.amount), 0) FROM payment p WHERE p.invoice = i.id)""",
    "lines_of_one_order": "SELECT amount FROM line WHERE sales_order = 'o500'",
}
SURREAL_PARENT = {
    "page_40_by_date": """SELECT id, order_date, math::sum((SELECT VALUE amount FROM line WHERE sales_order = $parent.id)) AS total,
        count((SELECT id FROM line WHERE sales_order = $parent.id)) AS n,
        count((SELECT id FROM invoice WHERE sales_order = $parent.id AND status != 'void')) > 0 AS invoiced
      FROM sales_order ORDER BY order_date DESC LIMIT 40""",
    "all_orders_with_totals": """SELECT id, math::sum((SELECT VALUE amount FROM line WHERE sales_order = $parent.id)) AS total,
        count((SELECT id FROM line WHERE sales_order = $parent.id)) AS n,
        count((SELECT id FROM invoice WHERE sales_order = $parent.id AND status != 'void')) > 0 AS invoiced
      FROM sales_order""",
    "page_40_by_total": """SELECT id, math::sum((SELECT VALUE amount FROM line WHERE sales_order = $parent.id)) AS total
      FROM sales_order ORDER BY total DESC LIMIT 40""",
    "overdue_invoices": """SELECT id FROM invoice WHERE status = 'issued' AND due_on < d"2026-11-04T00:00:00Z"
        AND amount > math::sum((SELECT VALUE amount FROM payment WHERE invoice = $parent.id))""",
    "lines_of_one_order": "SELECT amount FROM line WHERE sales_order = sales_order:o500",
}
SURREAL_REFS = {
    "page_40_by_date": """SELECT id, order_date, math::sum(<~line.amount) AS total, count(<~line) AS n,
        count(<~invoice[WHERE status != 'void']) > 0 AS invoiced
      FROM sales_order ORDER BY order_date DESC LIMIT 40""",
    "all_orders_with_totals": """SELECT id, math::sum(<~line.amount) AS total, count(<~line) AS n,
        count(<~invoice[WHERE status != 'void']) > 0 AS invoiced FROM sales_order""",
    "page_40_by_total": "SELECT id, math::sum(<~line.amount) AS total FROM sales_order ORDER BY total DESC LIMIT 40",
    "overdue_invoices": """SELECT id FROM invoice WHERE status = 'issued' AND due_on < d"2026-11-04T00:00:00Z"
        AND amount > math::sum(<~payment.amount)""",
    "lines_of_one_order": "SELECT amount FROM line WHERE sales_order = sales_order:o500",
}


# ───────────── SurrealDB ─────────────
def surreal_port():
    out = subprocess.run(["docker", "compose", "-p", APP_STACK, "-f", os.path.join(ROOT, "composer.yaml"), "port", "surrealdb", "8000"],
                         capture_output=True, text=True, check=True).stdout.strip()
    return int(out.rsplit(":", 1)[1])


def surreal(port, db, body, timeout=900):
    req = urllib.request.Request(f"http://127.0.0.1:{port}/sql", data=body.encode(), method="POST", headers={
        "Accept": "application/json", "surreal-ns": "bench", "surreal-db": db,
        "Authorization": "Basic " + base64.b64encode(b"root:root").decode()})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            res = json.load(resp)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"surreal {e.code}: {e.read().decode()[:400]}\nquery: {body[:200]}") from None
    for x in res:
        if x["status"] != "OK":
            raise RuntimeError(f"surreal: {x['result']}")
    return res


def dur_ms(s):
    for unit, f in (("ns", 1e-6), ("µs", 1e-3), ("us", 1e-3), ("ms", 1.0), ("s", 1000.0)):
        if s.endswith(unit) and not (unit == "s" and s[-2:] in ("ms", "µs", "us", "ns")):
            return float(s[: -len(unit)]) * f
    raise ValueError(s)


def surreal_load(port, db, data, refs):
    head = "DEFINE NAMESPACE IF NOT EXISTS bench; USE NS bench; DEFINE DATABASE IF NOT EXISTS %s;" % db
    req = urllib.request.Request(f"http://127.0.0.1:{port}/sql", data=head.encode(), method="POST", headers={
        "Accept": "application/json", "Authorization": "Basic " + base64.b64encode(b"root:root").decode()})
    urllib.request.urlopen(req).read()
    ref = " REFERENCE ON DELETE IGNORE" if refs else ""
    surreal(port, db, ";".join(f"REMOVE TABLE IF EXISTS {t}" for t in data) + ";" + f"""
      DEFINE TABLE sales_order SCHEMALESS; DEFINE TABLE line SCHEMALESS; DEFINE TABLE invoice SCHEMALESS;
      DEFINE TABLE payment SCHEMALESS; DEFINE TABLE customer SCHEMALESS;
      DEFINE FIELD sales_order ON line TYPE record<sales_order>{ref};
      DEFINE FIELD sales_order ON invoice TYPE record<sales_order>{ref};
      DEFINE FIELD invoice ON payment TYPE record<invoice>{ref};
      DEFINE INDEX line_order ON line FIELDS sales_order; DEFINE INDEX inv_order ON invoice FIELDS sales_order;
      DEFINE INDEX pay_inv ON payment FIELDS invoice; DEFINE INDEX order_date ON sales_order FIELDS order_date;""")
    rows = {
        "customer": [f'{{id: customer:{c}, name: "{n}"}}' for c, n in data["customer"]],
        "sales_order": [f'{{id: sales_order:{o}, customer: customer:{c}, order_date: d"{iso(d)}", status: "{s}"}}' for o, c, d, s in data["sales_order"]],
        "line": [f'{{id: line:{l}, sales_order: sales_order:{o}, product: "{p}", qty: {q}, amount: {a}}}' for l, o, p, q, a in data["line"]],
        "invoice": [f'{{id: invoice:{i}, sales_order: sales_order:{o}, customer: customer:{c}, amount: {a}, status: "{s}", due_on: d"{iso(d)}"}}'
                    for i, o, c, a, s, d in data["invoice"]],
        "payment": [f'{{id: payment:{p}, invoice: invoice:{i}, amount: {a}}}' for p, i, a in data["payment"]],
    }
    for table, recs in rows.items():
        for k in range(0, len(recs), 2000):
            surreal(port, db, f"INSERT INTO {table} [{','.join(recs[k:k + 2000])}] RETURN NONE;")


def surreal_time(port, db, q):
    return dur_ms(surreal(port, db, q + ";")[0]["time"])


# ───────────── PostgreSQL ─────────────
PG = ["docker", "compose", "-p", "erp-bench", "-f", os.path.join(ROOT, "bench", "compose.yaml")]
SQL_SCHEMA = """
DROP TABLE IF EXISTS payment, invoice, line, sales_order, customer;
CREATE TABLE customer (id text PRIMARY KEY, name text);
CREATE TABLE sales_order (id text PRIMARY KEY, customer text REFERENCES customer, order_date timestamp, status text);
CREATE TABLE line (id text PRIMARY KEY, sales_order text REFERENCES sales_order, product text, qty int, amount bigint);
CREATE TABLE invoice (id text PRIMARY KEY, sales_order text REFERENCES sales_order, customer text, amount bigint, status text, due_on timestamp);
CREATE TABLE payment (id text PRIMARY KEY, invoice text REFERENCES invoice, amount bigint);
CREATE INDEX line_order ON line (sales_order); CREATE INDEX inv_order ON invoice (sales_order);
CREATE INDEX pay_inv ON payment (invoice); CREATE INDEX order_date ON sales_order (order_date);
"""


def sql_rows(data):
    f = lambda d: d.strftime("%Y-%m-%d %H:%M:%S")
    return {
        "customer": data["customer"],
        "sales_order": [(o, c, f(d), s) for o, c, d, s in data["sales_order"]],
        "line": data["line"],
        "invoice": [(i, o, c, a, s, f(d)) for i, o, c, a, s, d in data["invoice"]],
        "payment": data["payment"],
    }


def psql(script, timeout=1800):
    return subprocess.run(PG + ["exec", "-T", "pg", "psql", "-U", "postgres", "-d", "bench", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
                          input=script, capture_output=True, text=True, check=True, timeout=timeout).stdout


def pg_load(data):
    script = [SQL_SCHEMA]
    for table, recs in sql_rows(data).items():
        script.append(f"COPY {table} FROM STDIN WITH (FORMAT csv);")
        script += [",".join(str(v) for v in rec) for rec in recs]
        script.append("\\.")
    script.append("ANALYZE;")
    psql("\n".join(script) + "\n")


def pg_times(q, runs):
    out = psql("\\o /dev/null\n\\timing on\n" + "\n".join([q + ";"] * runs) + "\n")
    return [float(line.split()[1]) for line in out.splitlines() if line.startswith("Time:")]


# ───────────── SQLite ─────────────
def sqlite_load(path, data):
    if os.path.exists(path):
        os.remove(path)
    con = sqlite3.connect(path)
    con.executescript(SQL_SCHEMA.replace("DROP TABLE IF EXISTS payment, invoice, line, sales_order, customer;", ""))
    for table, recs in sql_rows(data).items():
        con.executemany(f"INSERT INTO {table} VALUES ({','.join('?' * len(recs[0]))})", recs)
    con.execute("ANALYZE")
    con.commit()
    return con


def sqlite_time(con, q):
    t = time.perf_counter()
    con.execute(q).fetchall()
    return (time.perf_counter() - t) * 1000


# ───────────── run ─────────────
def measure(fn):
    t = fn()  # warm-up
    if t / 1000 > SLOW_S:
        return t, True
    return statistics.median(fn() for _ in range(RUNS)), False


def main():
    scales = [int(a) for a in sys.argv[1:]] or [1000, 4000, 10000]
    port = surreal_port()
    subprocess.run(PG + ["up", "-d", "--wait"], check=True, capture_output=True)
    results = []
    try:
        for n in scales:
            data = make_data(n)
            sizes = {k: len(v) for k, v in data.items()}
            print(f"\n== {n} orders: {sizes}", flush=True)
            surreal_load(port, "parent", data, refs=False)
            surreal_load(port, "refs", data, refs=True)
            pg_load(data)
            con = sqlite_load(os.path.join(ROOT, "data", "bench.sqlite"), data)
            for name in SQL:
                skip_parent = n > PARENT_MAX and name in WHOLE_TABLE
                # Same answer everywhere, or the timing comparison means nothing.
                counts = {
                    "surreal-refs": len(surreal(port, "refs", SURREAL_REFS[name] + ";")[0]["result"]),
                    "postgres": int(psql(f"\\t on\nSELECT count(*) FROM ({SQL[name]}) x;\n").split()[0]),
                    "sqlite": len(con.execute(SQL[name]).fetchall()),
                }
                if not skip_parent:
                    counts["surreal-parent"] = len(surreal(port, "parent", SURREAL_PARENT[name] + ";")[0]["result"])
                if len(set(counts.values())) != 1:
                    raise SystemExit(f"{name}: engines disagree on row count: {counts}")
                row = {"orders": n, "query": name, "rows": counts["postgres"]}
                row["surreal-parent"] = (float("nan"), True) if skip_parent else measure(lambda: surreal_time(port, "parent", SURREAL_PARENT[name]))
                row["surreal-refs"] = measure(lambda: surreal_time(port, "refs", SURREAL_REFS[name]))
                ts = pg_times(SQL[name], RUNS + 1)
                row["postgres"] = (statistics.median(ts[1:]), False)
                row["sqlite"] = measure(lambda: sqlite_time(con, SQL[name]))
                results.append(row)
                print("  " + name.ljust(24) + "  ".join(f"{k}={v[0]:9.1f}ms{'*' if v[1] else ' '}" for k, v in row.items() if isinstance(v, tuple)), flush=True)
            con.close()
    finally:
        subprocess.run(PG + ["down", "-v"], capture_output=True)
    with open(os.path.join(ROOT, "bench", "results.json"), "w") as f:
        json.dump({"scales": scales, "runs": RUNS, "results": results}, f, indent=1)


if __name__ == "__main__":
    main()
