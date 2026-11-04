import { useState } from "react";
import { observer, useCollection, useWindow } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { PURCHASING_TABS, Page } from "../Shell";
import { Avatar, Status, date, daysFromToday, money, money0, num, today, useRows, useRunner } from "../ui";
import type { Bills, PurchaseOrders } from "../vantage.gen";

// ── Deliveries: a timeline of what's arriving, receive straight from it ──
function bucket(iso: string | null) {
  const d = daysFromToday(iso);
  if (d < 0) return "Late";
  if (d === 0) return "Today";
  if (d <= 7) return "This week";
  return "Later";
}

export const Deliveries = observer(() => {
  const db = useDb();
  const { items: coming, ready } = useRows(db.purchase_orders.where({ status: "ordered" }).sort("expected_on", "asc"));
  const received = useWindow(db.purchase_orders.where({ status: "received" }).sort("received_on", "desc"), 0, 6);
  // The server sends them by expected date; consecutive rows share a heading.
  const groups: { name: string; rows: PurchaseOrders[] }[] = [];
  for (const p of coming) {
    const name = bucket(p.expected_on);
    if (groups.at(-1)?.name !== name) groups.push({ name, rows: [] });
    groups.at(-1)!.rows.push(p);
  }
  return (
    <Page tabs={PURCHASING_TABS} title="Expected deliveries" sub="What suppliers are bringing, by expected date. Post the goods receipt when it arrives at the dock.">
      <div className="grid-2" style={{ gridTemplateColumns: "2fr 1fr", alignItems: "start" }}>
        <div>
          {groups.length === 0 && <div className="card empty">{ready ? "Nothing on the way." : "Loading…"}</div>}
          {groups.map((g) => (
            <div key={g.name}>
              <div className="section-title" style={{ marginTop: 6 }}>
                <h2 style={{ color: g.name === "Late" ? "var(--negative)" : undefined }}>{g.name}</h2><span className="count">{g.rows.length}</span>
              </div>
              {g.rows.map((p) => <DeliveryCard key={p.id} p={p} />)}
            </div>
          ))}
        </div>
        <div>
          <div className="section-title" style={{ marginTop: 6 }}><h2>Recently received</h2></div>
          <div className="card">
            {received.items.map((p) => p && <ReceivedRow key={p.id} p={p} />)}
          </div>
        </div>
      </div>
    </Page>
  );
});

const DeliveryCard = observer(({ p }: { p: PurchaseOrders }) => {
  const lines = useCollection(p.lines).items;
  const { run, busy } = useRunner();
  const late = daysFromToday(p.expected_on);
  return (
    <div className="card card-pad" style={{ marginBottom: 10, display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ textAlign: "center", width: 54, flex: "none" }}>
        <div className="faint" style={{ fontSize: 11, textTransform: "uppercase" }}>{p.expected_on ? new Date(p.expected_on).toLocaleString("en-US", { month: "short" }) : ""}</div>
        <div style={{ fontSize: 26, fontWeight: 300, color: late < 0 ? "var(--negative)" : "var(--text)" }}>{p.expected_on ? new Date(p.expected_on).getDate() : "–"}</div>
      </div>
      <div className="grow">
        <div className="row"><b>{p["supplier.name"]}</b><span className="muted">{p.number}</span>{late < 0 && <span className="status s-negative">{-late} days late</span>}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{lines.map((l) => `${num(l.qty)} ${l["product.uom"]} ${l["product.name"]}`).join(" · ")}</div>
        <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{money(p.total)} · to {p["warehouse.name"]} · buyer {p["buyer.name"] ?? "—"}</div>
      </div>
      <button className="btn primary" disabled={busy} onClick={() => run(() => p.receive_goods(), `${p.number} received into stock`)}>Post goods receipt</button>
    </div>
  );
});

const ReceivedRow = observer(({ p }: { p: PurchaseOrders }) => {
  const { run, busy } = useRunner();
  return (
    <div className="task" style={{ padding: "12px 16px" }}>
      <div className="grow"><div style={{ fontWeight: 600 }}>{p["supplier.name"]}</div><div className="muted" style={{ fontSize: 12 }}>{p.number} · received {date(p.received_on)} · {money(p.total)}</div></div>
      <button className="btn sm" disabled={busy} title="Create the supplier's invoice from this order" onClick={() => run(() => p.enter_supplier_bill(), `Bill drafted for ${p.number}`)}>Enter bill</button>
    </div>
  );
});

// ── Payment run (like SAP F110): choose a pay-by date, review, pay all at once ──
export const PaymentRun = observer(() => {
  const db = useDb();
  const [until, setUntil] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const { items: due, ready } = useRows(db.bills.where({ state: ["overdue", "due_soon", "open"] }).sort("due_on", "asc"));
  // Ticked = due by the chosen date, unless the user flipped it.
  const [flip, setFlip] = useState<Set<string>>(new Set());
  const isOn = (b: Bills) => ((b.due_on ?? "").slice(0, 10) <= until) !== flip.has(b.id);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const { run } = useRunner();
  const selected = due.filter(isOn);
  const total = selected.reduce((a, b) => a + (b.outstanding ?? 0), 0);
  const execute = async () => {
    setProgress({ done: 0, total: selected.length });
    let n = 0;
    for (const b of [...selected]) {
      await run(() => db.bill_payments.create({ bill: b.id, amount: b.outstanding ?? 0, method: "bank_transfer" } as never));
      setProgress({ done: ++n, total: selected.length });
    }
    setProgress(null);
    setFlip(new Set());
  };
  return (
    <Page tabs={PURCHASING_TABS} title="Payment run" sub="Every approved bill still unpaid. Bills due by the date are ticked; untick any to hold back, tick later ones to pay early.">
      <div className="card">
        <div className="filterbar">
          <div className="field"><label>Pay bills due on or before</label><input type="date" className="input" value={until} min={today()} onChange={(e) => setUntil(e.target.value)} /></div>
          <div className="grow" />
          <div className="facet" style={{ textAlign: "right" }}><div className="k">{selected.length} bills selected</div><div className="v big">{money(total)}</div></div>
          <button className="btn primary" disabled={!selected.length || !!progress} onClick={execute}>
            {progress ? `Paying ${progress.done} of ${progress.total}…` : "Execute payment run"}
          </button>
        </div>
        <table className="table">
          <thead><tr><th style={{ width: 40 }} /><th>Supplier</th><th>Bill</th><th>Due</th><th>Status</th><th className="num">To pay</th></tr></thead>
          <tbody>{due.map((b) => <PayRow key={b.id} b={b} on={isOn(b)} toggle={() => setFlip((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} />)}</tbody>
        </table>
        {due.length === 0 && <div className="empty">{ready ? "No approved bills are waiting for payment." : "Loading…"}</div>}
      </div>
    </Page>
  );
});

const PayRow = observer(({ b, on, toggle }: { b: Bills; on: boolean; toggle: () => void }) => (
  <tr className="click" onClick={toggle} style={{ opacity: on ? 1 : 0.5 }}>
    <td><input type="checkbox" checked={on} onChange={toggle} onClick={(e) => e.stopPropagation()} aria-label={`Pay ${b.number}`} /></td>
    <td><div className="title">{b["supplier.name"]}</div><div className="sub">their invoice {b.supplier_ref}</div></td>
    <td>{b.number}</td>
    <td>{date(b.due_on)}</td>
    <td><Status value={b.state} /></td>
    <td className="num"><b>{money(b.outstanding)}</b></td>
  </tr>
));

// ── Suppliers: cards, because there are few and the rating matters ──
export const Suppliers = observer(() => {
  const db = useDb();
  const [cat, setCat] = useState("");
  const list = useCollection((cat ? db.suppliers.where({ category: cat }) : db.suppliers.all).sort("spend", "desc")).items;
  const cats = ["", "Raw materials", "Components", "Trading goods", "Packaging", "Services"];
  return (
    <Page tabs={PURCHASING_TABS} title="Suppliers" sub="Who we buy from, ranked by spend over the last 12 months.">
      <div className="chips" style={{ marginBottom: 14 }}>{cats.map((c) => <button key={c} className={`chip${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c || "All"}</button>)}</div>
      <div className="cards">
        {list.map((s) => (
          <div key={s.id} className="card card-pad">
            <div className="row"><Avatar name={s.name} size={40} /><div className="grow"><b>{s.name}</b><div className="muted" style={{ fontSize: 12 }}>{s.category} · {s.city}, {s.country}</div></div></div>
            <div style={{ color: "#e9a500", margin: "10px 0 2px", letterSpacing: 2 }} title={`Rated ${s.rating} of 5`}>{"★".repeat(s.rating ?? 0)}<span style={{ color: "var(--border-strong)" }}>{"★".repeat(5 - (s.rating ?? 0))}</span></div>
            <div className="row" style={{ marginTop: 10 }}>
              <div className="facet grow"><div className="k">Spend, 12 mo</div><div className="v">{money0(s.spend)}</div></div>
              <div className="facet grow"><div className="k">We owe</div><div className="v" style={{ color: (s.payable ?? 0) > 0 ? "var(--critical)" : undefined }}>{money0(s.payable)}</div></div>
              <div className="facet"><div className="k">Terms</div><div className="v">Net {s.payment_terms}</div></div>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}><a href={`mailto:${s.email}`}>{s.email}</a> · {s.phone}</div>
          </div>
        ))}
      </div>
    </Page>
  );
});
