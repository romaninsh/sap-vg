import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { observer, useCollection, useRecord, useWindow } from "@vantage-ui/client/react";
import { useDb } from "../db";
import type { SalesOrders } from "../vantage.gen";
import { Dialog, Facet, Status, ago, date, money, useRunner } from "../ui";
import { track } from "../analytics";

/** "Object Page" floorplan: header with key figures and actions, the document flow, then sections. */
export const SalesOrder = observer(() => {
  const db = useDb();
  const { id = "" } = useParams();
  const ref = useMemo(() => db.sales_orders.ref(id), [db, id]);
  const { value: o, status } = useRecord(ref);
  if (status === "missing") return <main className="page"><p>No such order. <Link to="/sales">Back to sales orders</Link></p></main>;
  if (!o) return <main className="page"><p className="muted">Loading…</p></main>;
  return (
    <main className="page">
      <div className="muted" style={{ marginBottom: 10 }}><Link to="/sales">Sales orders</Link> › {o.number}</div>
      <div className="card">
        <div className="op-head">
          <div className="op-title">
            <div className="grow">
              <div className="row"><h1>Sales order {o.number}</h1><Status value={o.status} /></div>
              <div className="muted" style={{ marginTop: 4 }}>{o["customer.name"]}{o.customer_ref ? ` · their ref. ${o.customer_ref}` : ""}</div>
            </div>
            <HeaderActions o={o} />
          </div>
          <div className="op-facets">
            <Facet k="Net value" big>{money(o.total)}</Facet>
            <Facet k="Ordered">{date(o.order_date)}</Facet>
            <Facet k="Requested delivery">{date(o.requested_on)}</Facet>
            <Facet k="Ship from">{o["warehouse.name"] ?? "—"}</Facet>
            <Facet k="Sales rep">{o["sales_rep.name"] ?? "—"}</Facet>
          </div>
        </div>
        <DocumentFlow o={o} />
      </div>

      <div className="section-title"><h2>Items</h2><span className="count">{o.line_count ?? 0}</span></div>
      <Items o={o} />

      <div className="grid-2">
        <div>
          <div className="section-title"><h2>Billing documents</h2></div>
          <Invoices o={o} />
        </div>
        <div>
          <div className="section-title"><h2>Changes</h2></div>
          <Changes id={o.id} />
        </div>
      </div>
    </main>
  );
});

const HeaderActions = observer(({ o }: { o: SalesOrders }) => {
  const { run, busy } = useRunner();
  const [cancel, setCancel] = useState(false);
  const can = (a: string) => o.$actions.includes(a as never);
  return (
    <div className="row">
      {can("confirm_order") && <button className="btn primary" disabled={busy} onClick={async () => { if (await run(() => o.confirm_order(), `${o.number} confirmed`)) track("demo_action", { action: "confirm_order" }); }}>Confirm order</button>}
      {can("ship_order") && <button className="btn primary" disabled={busy} onClick={() => run(() => o.ship_order(), `${o.number} shipped — stock issued`)}>Post goods issue</button>}
      {can("create_invoice") && <button className="btn primary" disabled={busy} onClick={() => run(() => o.create_invoice(), `Invoice created for ${o.number}`)}>Create invoice</button>}
      {(o.status === "draft" || o.status === "confirmed") && <button className="btn danger" onClick={() => setCancel(true)}>Cancel order</button>}
      {cancel && (
        <Dialog title={`Cancel ${o.number}?`} onClose={() => setCancel(false)} footer={<>
          <button className="btn ghost" onClick={() => setCancel(false)}>Keep order</button>
          <button className="btn primary" style={{ background: "var(--negative)", borderColor: "var(--negative)" }} disabled={busy}
            onClick={async () => { if (await run(() => o.patch({ status: "cancelled" }), `${o.number} cancelled`)) setCancel(false); }}>Cancel order</button>
        </>}>
          <p style={{ margin: 0 }}>A cancelled order can't be reopened. Nothing has been shipped or invoiced yet.</p>
        </Dialog>
      )}
    </div>
  );
});

/** SAP-style document flow: Order → Goods issue → Invoice → Payment. */
const DocumentFlow = observer(({ o }: { o: SalesOrders }) => {
  const db = useDb();
  const invoices = useCollection(db.invoices.where({ sales_order: o.id, status: ["draft", "issued"] })).items;
  const inv = invoices[0];
  const steps: { label: string; note: string; state: "done" | "now" | "todo" | "warn" }[] = [
    { label: "Sales order", note: o.status === "draft" ? "Draft" : o.status === "cancelled" ? "Cancelled" : `Confirmed · ${date(o.order_date)}`, state: o.status === "draft" ? "now" : o.status === "cancelled" ? "warn" : "done" },
    { label: "Goods issue", note: o.shipped_on ? date(o.shipped_on) : o.status === "confirmed" ? "Ready to ship" : "—", state: o.shipped_on ? "done" : o.status === "confirmed" ? "now" : "todo" },
    { label: "Invoice", note: inv ? `${inv.number} · ${inv.status === "draft" ? "draft" : date(inv.issued_on)}` : o.billing === "to_invoice" ? "To be created" : "—", state: inv?.status === "issued" ? "done" : o.billing === "to_invoice" || inv ? "now" : "todo" },
    { label: "Payment", note: inv ? (inv.state === "paid" ? "Paid in full" : inv.state === "overdue" ? `Overdue ${inv.days_overdue} days` : inv.status === "issued" ? `Due ${date(inv.due_on)}` : "—") : "—",
      state: inv?.state === "paid" ? "done" : inv?.state === "overdue" ? "warn" : inv?.status === "issued" ? "now" : "todo" },
  ];
  return (
    <div className="flow" aria-label="Document flow">
      {steps.map((s, i) => (
        <div key={s.label} style={{ display: "contents" }}>
          <div className="step">
            <span className={`node ${s.state === "todo" ? "" : s.state}`}>{s.state === "done" ? "✓" : s.state === "warn" ? "!" : i + 1}</span>
            <span className="label">{s.label}<span className="muted">{s.note}</span></span>
          </div>
          {i < steps.length - 1 && <span className={`line${s.state === "done" ? " done" : ""}`} />}
        </div>
      ))}
    </div>
  );
});

const Items = observer(({ o }: { o: SalesOrders }) => {
  const db = useDb();
  const linesC = useCollection(o.lines);
  const lines = linesC.items;
  const products = useCollection(db.products.where({ kind: ["finished", "trading", "service"], active: true }).sort("name", "asc")).items;
  const editable = o.status === "draft" || o.status === "confirmed";
  return (
    <div className="card">
      <table className="table">
        <thead><tr><th>Product</th><th className="num">Quantity</th><th className="num">Unit price</th><th className="num">Discount</th><th className="num">Net amount</th>{editable && <th />}</tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td><div className="title">{l["product.name"]}</div><div className="sub">{l["product.sku"]}</div></td>
              <td className="num">{l.qty}</td>
              <td className="num">{money(l.unit_price)}</td>
              <td className="num">{l.discount_pct ? `${l.discount_pct}%` : "—"}</td>
              <td className="num"><b>{money(l.amount)}</b></td>
              {editable && <td className="num"><RemoveLine del={() => l.delete()} /></td>}
            </tr>
          ))}
          {editable && <AddLine o={o} products={products} />}
        </tbody>
        <tfoot><tr><td colSpan={4} className="num muted">Total</td><td className="num"><b>{money(o.total)}</b></td>{editable && <td />}</tr></tfoot>
      </table>
      {lines.length === 0 && !editable && <div className="empty">{linesC.loadState === "complete" ? "No items." : "Loading…"}</div>}
    </div>
  );
});

function RemoveLine({ del }: { del: () => Promise<unknown> }) {
  const { run, busy } = useRunner();
  return <button className="icon-btn" disabled={busy} title="Remove item" onClick={() => run(del as never, "Item removed")}>✕</button>;
}

const AddLine = observer(({ o, products }: { o: SalesOrders; products: readonly { id: string; name: string | null; sale_price: number | null; on_hand: number | null; kind: string | null }[] }) => {
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState("1");
  const [disc, setDisc] = useState("");
  const { run, busy } = useRunner();
  const p = products.find((x) => x.id === product);
  const db = useDb();
  // The price comes from the price list in the database when none is given.
  const add = async () => {
    if (await run(() => db.sales_order_lines.create({ sales_order: o.id, product, qty: Number(qty) || 1, discount_pct: Number(disc) || 0 } as never), "Item added")) {
      setProduct(""); setQty("1"); setDisc("");
    }
  };
  return (
    <tr style={{ background: "var(--surface-alt)" }}>
      <td>
        <select className="select" style={{ width: "100%" }} value={product} onChange={(e) => setProduct(e.target.value)} aria-label="Product to add">
          <option value="">＋ Add a product…</option>
          {products.map((x) => <option key={x.id} value={x.id}>{x.name}{x.kind !== "service" ? ` — ${x.on_hand} in stock` : ""}</option>)}
        </select>
      </td>
      <td className="num"><input className="input num" style={{ width: 80 }} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" /></td>
      <td className="num muted">{p ? money(p.sale_price) : ""}</td>
      <td className="num"><input className="input num" style={{ width: 70 }} placeholder="0" value={disc} onChange={(e) => setDisc(e.target.value)} aria-label="Discount %" /></td>
      <td className="num muted">{p ? money(Math.round((p.sale_price ?? 0) * (Number(qty) || 0) * (100 - (Number(disc) || 0)) / 100)) : ""}</td>
      <td className="num"><button className="btn sm primary" disabled={!product || busy} onClick={add}>Add</button></td>
    </tr>
  );
});

const Invoices = observer(({ o }: { o: SalesOrders }) => {
  const invsC = useCollection(o.invoices);
  const invs = invsC.items;
  if (invs.length === 0 && invsC.loadState !== "complete") return <div className="card"><div className="empty">Loading…</div></div>;
  if (invs.length === 0) return <div className="card"><div className="empty">{o.billing === "to_invoice" ? "Shipped — ready to invoice." : "No invoices yet."}</div></div>;
  return (
    <div className="card">
      <table className="table">
        <thead><tr><th>Invoice</th><th>Due</th><th>Payment</th><th className="num">Outstanding</th></tr></thead>
        <tbody>{invs.map((i) => (
          <tr key={i.id} className="click" onClick={() => location.assign(`/sales/receivables?invoice=${encodeURIComponent(i.id)}`)}>
            <td><div className="title">{i.number}</div><div className="sub">{money(i.amount)}</div></td>
            <td>{date(i.due_on)}</td><td><Status value={i.state} /></td><td className="num">{money(i.outstanding)}</td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
});

const Changes = observer(({ id }: { id: string }) => {
  const db = useDb();
  const page = useWindow(db.changes.where({ sales_order: id }).sort("at", "desc"), 0, 12);
  if (page.settled && page.length === 0) return <div className="card"><div className="empty">No changes recorded through the app yet.</div></div>;
  return (
    <div className="card card-pad">
      {page.items.map((c) => c && (
        <div key={c.id} className="row" style={{ padding: "6px 0", alignItems: "flex-start" }}>
          <span className="faint" style={{ width: 90, flex: "none", fontSize: 12 }}>{ago(c.at)}</span>
          <span className="grow"><b>{c.who}</b> {c.action === "new" ? "added" : c.action === "delete" ? "removed" : "changed"} {c.table === "sales_order_line" ? "an item" : "the order"}
            {c.action === "edit" && c.after && <span className="muted"> → {summarize(c.after)}</span>}</span>
        </div>
      ))}
    </div>
  );
});
function summarize(json: string) {
  try { return Object.entries(JSON.parse(json)).filter(([k]) => k !== "id").map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", "); } catch { return json; }
}
