import { useState } from "react";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { Page } from "../Shell";
import { Drawer, Facet, Status, date, money, num, useRows, useRunner } from "../ui";
import type { WorkOrders } from "../vantage.gen";

const DAY = 86400000;
const COLORS: Record<string, string> = { planned: "#8396a8", released: "#0070f2", in_progress: "#e76500", done: "#256f3a" };

/** Shop floor as a timeline (Gantt): when each work order runs, what's late, act on a bar. */
export const Production = observer(() => {
  const db = useDb();
  const { items: active, ready } = useRows(db.work_orders.where({ status: ["planned", "released", "in_progress"] }).sort("start_on", "asc"));
  const [open, setOpen] = useState<WorkOrders | null>(null);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const from = t0.getTime() - 21 * DAY, to = t0.getTime() + 21 * DAY;
  const pct = (iso: string | null) => Math.min(100, Math.max(0, ((new Date(iso ?? 0).getTime() - from) * 100) / (to - from)));
  const weeks = Array.from({ length: 7 }, (_, i) => from + i * 7 * DAY);
  return (
    <Page title="Shop floor" sub="Open work orders on a six-week timeline. The red line is today. Click a bar to release, start or complete it.">
      <div className="row" style={{ marginBottom: 12, gap: 16, fontSize: 12 }}>
        {Object.entries(COLORS).filter(([k]) => k !== "done").map(([k, c]) => <span key={k} className="row" style={{ gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: c }} /><Status value={k} /></span>)}
        <span className="row" style={{ gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "repeating-linear-gradient(45deg,#d20a0a,#d20a0a 3px,#ff8080 3px,#ff8080 6px)" }} />Late</span>
      </div>
      <div className="card gantt">
        <div className="gantt-row" style={{ minHeight: 30 }}>
          <div className="who muted">Work order</div>
          <div className="gantt-scale">{weeks.slice(0, -1).map((w) => <span key={w} style={{ left: `${((w - from) * 100) / (to - from)}%` }}>{date(new Date(w).toISOString()).replace(/, \d{4}/, "")}</span>)}</div>
        </div>
        {active.map((w) => {
          const l = pct(w.start_on), r = pct(w.due_on);
          return (
            <div key={w.id} className="gantt-row">
              <div className="who"><b>{w.number}</b> <span className="muted">· {num(w.qty)} × {w["product.name"]}</span></div>
              <div className="gantt-track">
                <div className="gantt-grid">{weeks.map((x) => <i key={x} style={{ left: `${((x - from) * 100) / (to - from)}%` }} />)}<i className="today" style={{ left: "50%" }} /></div>
                <div className="gantt-bar" onClick={() => setOpen(w)} title={`${w.number}: ${date(w.start_on)} – ${date(w.due_on)}`}
                  style={{ left: `${l}%`, width: `${Math.max(2, r - l)}%`,
                    background: w.late ? "repeating-linear-gradient(45deg,#d20a0a,#d20a0a 6px,#e04444 6px,#e04444 12px)" : COLORS[w.status ?? "planned"] }}>
                  {w["product.name"]}
                </div>
              </div>
            </div>
          );
        })}
        {active.length === 0 && <div className="empty">{ready ? "No open work orders." : "Loading…"}</div>}
      </div>
      {open && <WorkOrderDrawer w={open} onClose={() => setOpen(null)} />}
    </Page>
  );
});

const WorkOrderDrawer = observer(({ w, onClose }: { w: WorkOrders; onClose: () => void }) => {
  const db = useDb();
  const bom = useCollection(db.bom_lines.where({ product: w.product.id ?? "" })).items;
  const { run, busy } = useRunner();
  const can = (a: string) => w.$actions.includes(a as never);
  const act = async (fn: () => Promise<unknown>, msg: string) => { if (await run(fn as never, msg)) onClose(); };
  return (
    <Drawer onClose={onClose} head={<><div className="row"><h2 style={{ fontSize: 20 }}>{w.number}</h2><Status value={w.status} />{w.late && <span className="status s-negative">Late</span>}</div><div className="muted">{num(w.qty)} × {w["product.name"]}</div></>}>
      <div className="op-facets" style={{ paddingTop: 0 }}>
        <Facet k="Start">{date(w.start_on)}</Facet><Facet k="Due">{date(w.due_on)}</Facet><Facet k="Material cost">{money(w.material_cost)}</Facet>
      </div>
      <h3 style={{ margin: "0 0 8px" }}>Material availability</h3>
      <table className="table"><thead><tr><th>Component</th><th className="num">Needed</th><th className="num">On hand</th><th /></tr></thead><tbody>
        {bom.map((b) => <BomRow key={b.id} need={(b.qty ?? 0) * (w.qty ?? 0)} id={b.component.id ?? ""} name={b["component.name"]} uom={b["component.uom"]} />)}
      </tbody></table>
      <div className="row" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        {can("cancel") && <button className="btn danger" disabled={busy} onClick={() => act(() => w.patch({ status: "cancelled" }), `${w.number} cancelled`)}>Cancel</button>}
        {can("release_to_shop_floor") && <button className="btn primary" disabled={busy} onClick={() => act(() => w.release_to_shop_floor(), `${w.number} released`)}>Release</button>}
        {can("start_production") && <button className="btn primary" disabled={busy} onClick={() => act(() => w.start_production(), `${w.number} started`)}>Start</button>}
        {can("complete") && <button className="btn primary" disabled={busy} onClick={() => act(() => w.complete(), `${w.number} complete — finished goods in stock`)}>Confirm completion</button>}
      </div>
    </Drawer>
  );
});

const BomRow = observer(({ id, need, name, uom }: { id: string; need: number; name: string | null; uom: string | null }) => {
  const db = useDb();
  const p = db.products.get(id);
  const have = p?.on_hand ?? 0;
  return <tr><td>{name}</td><td className="num">{num(need)} {uom}</td><td className="num">{num(have)}</td><td>{have >= need ? <span className="status s-positive">OK</span> : <span className="status s-negative">Short {num(need - have)}</span>}</td></tr>;
});
