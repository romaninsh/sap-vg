#!/usr/bin/env python3
"""Copy the local app database to another SurrealDB (a scratch namespace or SurrealDB Cloud).

Why not just `surreal import`: an import (OPTION IMPORT) doesn't record record references, so
every `<~child` rollup would read 0, and the export's sequences restart at their START value.
So, against the target:
  1. tests/schema.surql, then every event removed (the rules stay off while data goes in);
  2. the data rows from `surreal export`, written as normal INSERTs (references get recorded;
     with no events, no ledger entry is posted twice);
  3. tests/schema.surql again (events back);
  4. each number sequence restarted after the highest number in use;
  5. row counts and reference counts compared with the source.

usage:
  python3 -I tests/copy_db.py --to-local <namespace>      dry run into a local scratch namespace
  python3 -I tests/copy_db.py --to-cloud private/cloud.env
The cloud file holds SURREAL_ENDPOINT (wss://…), SURREAL_USER, SURREAL_PASS, SURREAL_NS, SURREAL_DB;
nothing from it is printed. The target must be empty (checked first).
"""
import json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STACK = "vantage-dev-erp-vg-609e1c378d25b9b8"
SEQUENCES = {  # sequence -> (table, number prefix)
    "seq_so": ("sales_order", "SO-"), "seq_po": ("purchase_order", "PO-"), "seq_inv": ("invoice", "INV-"),
    "seq_bill": ("bill", "BILL-"), "seq_wo": ("work_order", "WO-"), "seq_je": ("journal_entry", "JE-"),
    "seq_opp": ("opportunity", "OPP-"),
}
# Each check runs on source and target and must give the same answer.
CHECKS = {
    "sales orders": "count(SELECT id FROM sales_order)",
    "order lines": "count(SELECT id FROM sales_order_line)",
    "journal lines": "count(SELECT id FROM journal_line)",
    "stock moves": "count(SELECT id FROM stock_move)",
    "audit entries": "count(SELECT id FROM audit_event)",
    "order→line references": "math::sum((SELECT VALUE count(<~sales_order_line) FROM sales_order))",
    "product→move references": "math::sum((SELECT VALUE count(<~stock_move) FROM product))",
    "account→line references": "math::sum((SELECT VALUE count(<~journal_line) FROM gl_account))",
    "ledger balance (debits−credits)": "math::sum((SELECT VALUE debit - credit FROM journal_line))",
    "stock on hand": "math::sum((SELECT VALUE qty FROM stock_move))",
    "paid on invoices": "math::sum((SELECT VALUE paid_amount FROM invoice))",
}


def local_env(ns, db="app"):
    port = subprocess.run(["docker", "compose", "-p", STACK, "-f", os.path.join(ROOT, "composer.yaml"), "port", "surrealdb", "8000"],
                          capture_output=True, text=True, check=True).stdout.strip().rsplit(":", 1)[1]
    return dict(os.environ, SURREAL_HTTP=f"http://127.0.0.1:{port}", SURREAL_HTTP_AUTH="root:root",
                SURREAL_AUTH="root", SURREAL_NS=ns, SURREAL_DB=db)


def cloud_env(path):
    vals = dict(line.split("=", 1) for line in open(path).read().splitlines() if "=" in line and not line.startswith("#"))
    vals = {k.strip(): v.strip().strip('"').strip("'") for k, v in vals.items()}
    ep = vals["SURREAL_ENDPOINT"].removesuffix("/rpc")
    return dict(os.environ, SURREAL_HTTP="https://" + ep.removeprefix("wss://").removeprefix("https://"),
                SURREAL_HTTP_AUTH=f"{vals['SURREAL_USER']}:{vals['SURREAL_PASS']}", SURREAL_AUTH="database",
                SURREAL_NS=vals["SURREAL_NS"], SURREAL_DB=vals["SURREAL_DB"])


def run(env, sql=None, path=None, quiet=True):
    """Run SurrealQL through tests/surql.sh; return its output lines; raise on a failed statement."""
    p = subprocess.run([os.path.join(ROOT, "tests", "surql.sh"), path or "-", "-q" if quiet else "-f"],
                       input=sql, capture_output=True, text=True, env=env, timeout=1800)
    if p.returncode != 0:
        raise SystemExit(f"failed:\n{p.stdout[-3000:]}{p.stderr[-1000:]}")
    return p.stdout.splitlines()


def value(env, expr):
    line = run(env, f"RETURN {expr};", quiet=False)[-1]
    return json.loads(line.split("OK", 1)[1])


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("--to-local", "--to-cloud"):
        raise SystemExit(__doc__)
    src = local_env("app")
    dst = local_env(sys.argv[2]) if sys.argv[1] == "--to-local" else cloud_env(sys.argv[2])
    where = f"local namespace {sys.argv[2]}" if sys.argv[1] == "--to-local" else "SurrealDB Cloud"

    tables = value(dst, "(INFO FOR DB).tables.keys()")
    if tables:
        raise SystemExit(f"{where} already has tables {tables}; it must be empty. Nothing was written.")

    # The data rows only, one INSERT per line. From the HTTP /export endpoint: the CLI's
    # `surreal export -` mixes its log lines into stdout, sometimes in the middle of a row.
    export = subprocess.run(["curl", "-sf", "-u", "root:root", "-H", "surreal-ns: app", "-H", "surreal-db: app",
                             "-H", "Accept: application/octet-stream", src["SURREAL_HTTP"] + "/export"],
                            capture_output=True, text=True, check=True).stdout
    inserts = [l for l in export.splitlines() if l.startswith("INSERT ")]
    # The schema file selects the local `app` namespace on its first line; surql.sh already selects
    # the target, so drop those statements or the schema would land back in the local database.
    schema = re.sub(r"(DEFINE (NAMESPACE|DATABASE) IF NOT EXISTS \w+;|USE NS \w+( DB \w+)?;)", "",
                    open(os.path.join(ROOT, "tests", "schema.surql")).read())
    events = re.findall(r"DEFINE EVENT OVERWRITE (\w+) ON TABLE (\w+)", schema)
    print(f"source: {len(inserts)} INSERT statements; schema with {len(events)} events")

    print("1/5 schema"); run(dst, schema)
    run(dst, "".join(f"REMOVE EVENT IF EXISTS {e} ON TABLE {t};" for e, t in events))
    print("2/5 data")
    with tempfile.NamedTemporaryFile("w", suffix=".surql", delete=False) as f:
        f.write("\n".join(inserts) + "\n")
    try:
        run(dst, path=f.name)
    finally:
        os.remove(f.name)
    print("3/5 rules back on"); run(dst, schema)
    print("4/5 sequences")
    stmts = []
    for seq, (table, prefix) in SEQUENCES.items():
        top = value(src, f"math::max((SELECT VALUE <int> string::slice(number, {len(prefix)}) FROM {table} WHERE string::starts_with(number ?? '', '{prefix}')))")
        stmts.append(f"REMOVE SEQUENCE IF EXISTS {seq}; DEFINE SEQUENCE {seq} START {int(top or 0) + 1};")
    run(dst, " ".join(stmts))
    print("5/5 compare")
    bad = 0
    for name, expr in CHECKS.items():
        a, b = value(src, expr), value(dst, expr)
        ok = a == b
        bad += not ok
        print(f"  {'ok ' if ok else 'BAD'} {name}: source {a}, target {b}")
    if bad:
        raise SystemExit(f"{bad} checks differ")
    print(f"copied to {where}")


if __name__ == "__main__":
    main()
