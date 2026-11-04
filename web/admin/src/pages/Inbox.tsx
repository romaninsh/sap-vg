import { useState, type ReactNode } from "react";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { Page } from "../Shell";
import { Avatar, date, money, num, useCount, useRows, useRunner } from "../ui";
import type { Bills, JournalEntries, LeaveRequests, PurchaseOrders } from "../vantage.gen";

/** SAP "My Inbox": every decision waiting for someone, one card each, approve in place. */
const KINDS = [
  { key: "po", label: "Purchase orders to send", icon: "🛒", bg: "#e1f4ff" },
  { key: "bill", label: "Supplier bills to approve", icon: "🧾", bg: "#fff3b8" },
  { key: "leave", label: "Leave requests", icon: "🌴", bg: "#f5fae5" },
  { key: "je", label: "Journal entries to post", icon: "📒", bg: "#f1ecff" },
] as const;
type Kind = (typeof KINDS)[number]["key"];

const Count = observer(({ k }: { k: Kind }) => {
  const db = useDb();
  const coll = k === "po" ? db.purchase_orders.where({ status: "draft" }) : k === "bill" ? db.bills.where({ status: "draft" })
    : k === "leave" ? db.leave_requests.where({ status: "pending" }) : db.journal_entries.where({ status: "draft" });
  const n = useCount(coll as Parameters<typeof useCount>[0]);
  return <span className="badge">{n === undefined ? "…" : num(n)}</span>;
});

export const Inbox = observer(() => {
  const [k, setK] = useState<Kind>("po");
  const kind = KINDS.find((x) => x.key === k)!;
  return (
    <Page title="My Inbox" sub="Decisions waiting for you. Each one updates live as colleagues act on them.">
      <div className="inbox">
        <div className="card inbox-nav" style={{ padding: 8, alignSelf: "start" }}>
          {KINDS.map((x) => <button key={x.key} className={x.key === k ? "on" : ""} onClick={() => setK(x.key)}><span>{x.icon}&nbsp; {x.label}</span><Count k={x.key} /></button>)}
        </div>
        <div className="card">
          <div className="card-pad" style={{ borderBottom: "1px solid var(--border)" }}><h2>{kind.label}</h2></div>
          {k === "po" && <PoTasks />}
          {k === "bill" && <BillTasks />}
          {k === "leave" && <LeaveTasks />}
          {k === "je" && <JeTasks />}
        </div>
      </div>
    </Page>
  );
});

function Task({ icon, bg, title, meta, children, aside }: { icon: string; bg: string; title: ReactNode; meta: ReactNode; children?: ReactNode; aside: ReactNode }) {
  return (
    <div className="task">
      <span className="kind" style={{ background: bg }}>{icon}</span>
      <div className="grow"><div style={{ fontWeight: 600 }}>{title}</div><div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{meta}</div>{children}</div>
      <div className="row" style={{ gap: 8 }}>{aside}</div>
    </div>
  );
}
const None = ({ ready }: { ready: boolean }) => <div className="empty">{ready ? "All done here. ✔︎" : "Loading…"}</div>;

const PoTasks = observer(() => {
  const db = useDb();
  const { items, ready } = useRows(db.purchase_orders.where({ status: "draft" }).sort("order_date", "desc"));
  return items.length ? <>{items.map((p) => <PoTask key={p.id} p={p} />)}</> : <None ready={ready} />;
});
const PoTask = observer(({ p }: { p: PurchaseOrders }) => {
  const linesC = useCollection(p.lines);
  const lines = linesC.items;
  const { run, busy } = useRunner();
  return (
    <Task icon="🛒" bg="#e1f4ff" title={<>{p.number} · {p["supplier.name"]} · {money(p.total)}</>}
      meta={lines.map((l) => `${l.qty} ${l["product.uom"]} ${l["product.name"]}`).join(" · ") || (linesC.loadState === "complete" ? "No items yet" : "…")}
      aside={<>
        <button className="btn danger" disabled={busy} onClick={() => run(() => p.patch({ status: "cancelled" }), `${p.number} cancelled`)}>Reject</button>
        <button className="btn primary" disabled={busy} onClick={() => run(() => p.send_to_supplier(), `${p.number} sent to ${p["supplier.name"]}`)}>Approve & send</button>
      </>} />
  );
});

const BillTasks = observer(() => {
  const db = useDb();
  const { items, ready } = useRows(db.bills.where({ status: "draft" }).sort("due_on", "asc"));
  return items.length ? <>{items.map((b) => <BillTask key={b.id} b={b} />)}</> : <None ready={ready} />;
});
const BillTask = observer(({ b }: { b: Bills }) => {
  const { run, busy } = useRunner();
  const po = b.purchase_order.value;
  const match = po && po.total === b.amount;
  return (
    <Task icon="🧾" bg="#fff3b8" title={<>{b["supplier.name"]} · {money(b.amount)}</>}
      meta={<>Their invoice {b.supplier_ref} · due {date(b.due_on)} · {po ? <>PO {po.number} {match ? <span style={{ color: "var(--positive)" }}>✓ amount matches the order</span> : <span style={{ color: "var(--critical)" }}>⚠ order total {money(po.total)}</span>}</> : "no purchase order"}</>}
      aside={<button className="btn primary" disabled={busy} onClick={() => run(() => b.approve_bill(), `${b.number} approved`)}>Approve</button>} />
  );
});

const LeaveTasks = observer(() => {
  const db = useDb();
  const { items, ready } = useRows(db.leave_requests.where({ status: "pending" }).sort("starts_on", "asc"));
  return items.length ? <>{items.map((l) => <LeaveTask key={l.id} l={l} />)}</> : <None ready={ready} />;
});
const LeaveTask = observer(({ l }: { l: LeaveRequests }) => {
  const { run, busy } = useRunner();
  return (
    <div className="task">
      <Avatar name={l["employee.name"]} size={40} />
      <div className="grow">
        <div style={{ fontWeight: 600 }}>{l["employee.name"]} · {l.days} day{l.days === 1 ? "" : "s"} {l.kind}</div>
        <div className="muted" style={{ fontSize: 13 }}>{date(l.starts_on)} – {date(l.ends_on)} · asked {date(l.requested_on)}</div>
      </div>
      <button className="btn danger" disabled={busy} onClick={() => run(() => l.reject(), "Leave rejected")}>Reject</button>
      <button className="btn primary" disabled={busy} onClick={() => run(() => l.approve(), "Leave approved")}>Approve</button>
    </div>
  );
});

const JeTasks = observer(() => {
  const db = useDb();
  const { items, ready } = useRows(db.journal_entries.where({ status: "draft" }));
  return items.length ? <>{items.map((e) => <JeTask key={e.id} e={e} />)}</> : <None ready={ready} />;
});
const JeTask = observer(({ e }: { e: JournalEntries }) => {
  const db = useDb();
  const lines = useCollection(db.journal_lines.where({ entry: e.id })).items;
  const { run, busy } = useRunner();
  return (
    <Task icon="📒" bg="#f1ecff" title={<>{e.number} · {e.memo}</>}
      meta={lines.map((l) => `${l["account.code"]} ${l["account.name"]} ${l.debit ? "Dr " + money(l.debit) : "Cr " + money(l.credit)}`).join(" · ")}
      aside={e.balanced
        ? <button className="btn primary" disabled={busy} onClick={() => run(() => e.post_entry(), `${e.number} posted`)}>Post</button>
        : <span className="status s-negative">Doesn't balance</span>} />
  );
});
