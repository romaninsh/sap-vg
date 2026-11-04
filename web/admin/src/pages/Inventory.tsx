import { useMemo, useState } from "react";
import { observer, useCollection, useRecord, useRun, useRunMessage, useWindow } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { Page } from "../Shell";
import { Drawer, Facet, Status, ago, money, money0, num, useToast } from "../ui";
import type { Products } from "../vantage.gen";

const KINDS = [
  { key: "", label: "Everything" },
  { key: "finished", label: "Finished goods" },
  { key: "raw", label: "Raw materials" },
  { key: "trading", label: "Trading goods" },
];
const MOVE: Record<string, string> = { opening: "Opening balance", receipt: "Goods receipt", issue: "Goods issue", production: "Production output", consumption: "Used in production", adjustment: "Adjustment" };

/** Stock overview as cards with a gauge: how far above (or below) its reorder level each item sits. */
export const Inventory = observer(() => {
  const db = useDb();
  const [kind, setKind] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const where: Record<string, unknown> = { kind: kind ? kind : ["finished", "raw", "trading"] };
  if (lowOnly) where.stock_state = ["low", "out"];
  const itemsC = useCollection(db.products.where(where as never).sort("sku", "asc"));
  const items = itemsC.items;
  const warehouses = useCollection(db.warehouses.all).items;
  return (
    <Page title="Stock overview" sub="On-hand quantity against each item's reorder level. Click an item for its movements and bill of materials."
      actions={<MrpButton />}>
      <div className="row" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <div className="chips">{KINDS.map((k) => <button key={k.key} className={`chip${kind === k.key ? " on" : ""}`} onClick={() => setKind(k.key)}>{k.label}</button>)}</div>
        <label className="row" style={{ gap: 6, marginLeft: 12, cursor: "pointer" }}><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Only items that need buying or making</label>
        <div className="grow" />
        {warehouses.map((w) => <span key={w.id} className="muted" style={{ fontSize: 12 }}><b style={{ color: "var(--text)" }}>{w.code}</b> {money0(w.stock_value)}</span>)}
      </div>
      <div className="cards">
        {items.map((p) => <ProductCard key={p.id} p={p} onOpen={() => setOpen(p.id)} />)}
      </div>
      {items.length === 0 && <div className="card empty">{itemsC.loadState === "complete" ? "Every item is above its reorder level. 👍" : "Loading stock…"}</div>}
      {open && <ProductDrawer id={open} onClose={() => setOpen(null)} />}
    </Page>
  );
});

const ProductCard = observer(({ p, onOpen }: { p: Products; onOpen: () => void }) => {
  const on = p.on_hand ?? 0, re = p.reorder_level ?? 0;
  const scale = Math.max(re * 3, on, 1);
  const tone = p.stock_state === "out" ? "var(--negative)" : p.stock_state === "low" ? "var(--critical)" : "var(--positive)";
  return (
    <div className="card pcard" onClick={onOpen}>
      <div className="row"><span className="faint" style={{ fontSize: 12 }}>{p.sku}</span><div className="grow" /><Status value={p.stock_state} /></div>
      <div style={{ fontWeight: 600, marginTop: 6 }}>{p.name}</div>
      <div className="gauge" title={`Reorder at ${re}`}><span style={{ width: `${(on * 100) / scale}%`, background: tone }} /><i style={{ left: `${(re * 100) / scale}%` }} /></div>
      <div className="row" style={{ fontSize: 12 }}>
        <span><b style={{ fontSize: 15 }}>{num(on)}</b> {p.uom} on hand</span><div className="grow" /><span className="muted">reorder at {num(re)}</span>
      </div>
      <div className="row muted" style={{ fontSize: 12, marginTop: 6 }}><span>{p["category.name"]}</span><div className="grow" /><span>{money0(p.stock_value)}</span></div>
    </div>
  );
});

/** Runs the shared reorder action (also on the desktop's Products page) and shows its result. */
const MrpButton = observer(() => {
  const db = useDb();
  const toast = useToast();
  const mrp = useRun(db.run.reorder_low_stock, { key: "mrp" });
  useRunMessage(mrp, "vantage.notify", (m) => toast(m.text));
  const busy = mrp.status === "starting" || mrp.status === "running";
  return <button className="btn primary" disabled={busy} title="Draft purchase orders for every bought item below its reorder level" onClick={() => mrp.start()}>{busy ? "Planning…" : "Run MRP (reorder)"}</button>;
});

const ProductDrawer = observer(({ id, onClose }: { id: string; onClose: () => void }) => {
  const db = useDb();
  const ref = useMemo(() => db.products.ref(id), [db, id]);
  const { value: p } = useRecord(ref);
  const moves = useWindow(db.stock_moves.where({ product: id }).sort("moved_at", "desc"), 0, 15);
  const bom = useCollection(db.bom_lines.where({ product: id })).items;
  if (!p) return null;
  return (
    <Drawer onClose={onClose} head={<><div className="faint">{p.sku}</div><h2 style={{ fontSize: 20 }}>{p.name}</h2><div style={{ marginTop: 6 }}><Status value={p.stock_state} /></div></>}>
      <div className="op-facets" style={{ paddingTop: 0 }}>
        <Facet k="On hand" big>{num(p.on_hand)} <span className="muted" style={{ fontSize: 14 }}>{p.uom}</span></Facet>
        <Facet k="Stock value">{money0(p.stock_value)}</Facet>
        <Facet k="Standard cost">{money(p.cost_price)}</Facet>
        {p.kind !== "raw" && <Facet k="List price">{money(p.sale_price)} {p.margin_pct != null && <span className="muted">({p.margin_pct}% margin)</span>}</Facet>}
        {p["supplier.name"] && <Facet k="Bought from">{p["supplier.name"]}</Facet>}
      </div>
      {bom.length > 0 && <>
        <h3 style={{ margin: "8px 0" }}>Made from (per unit)</h3>
        <table className="table"><tbody>{bom.map((b) => <tr key={b.id}><td>{b["component.name"]}</td><td className="num">{b.qty} {b["component.uom"]}</td><td className="num muted">{money(b.cost)}</td></tr>)}</tbody></table>
      </>}
      <h3 style={{ margin: "18px 0 8px" }}>Recent movements</h3>
      <table className="table"><tbody>
        {moves.items.map((m) => m && (
          <tr key={m.id}><td><div>{MOVE[m.kind ?? ""] ?? m.kind}</div><div className="sub">{m.reference} · {m["warehouse.code"]}</div></td>
            <td className="muted" style={{ fontSize: 12 }}>{ago(m.moved_at)}</td>
            <td className="num" style={{ color: (m.qty ?? 0) < 0 ? "var(--negative)" : "var(--positive)", fontWeight: 600 }}>{(m.qty ?? 0) > 0 ? "+" : ""}{num(m.qty)}</td></tr>))}
      </tbody></table>
    </Drawer>
  );
});
