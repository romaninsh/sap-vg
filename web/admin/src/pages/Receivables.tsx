import { useState } from "react";
import { useSearchParams } from "react-router";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { Page, SALES_TABS } from "../Shell";
import { InfiniteTable, useSortParam, type Col } from "../InfiniteTable";
import { Status, date, money, num, useCount, useRunner } from "../ui";
import type { Invoices } from "../vantage.gen";

/** Collections cockpit: where the money is stuck (aging), then a worklist to chase or post payments inline. */
const VIEWS = [
  { key: "overdue", label: "Overdue", where: { state: "overdue" }, sort: ["days_overdue", "desc"] },
  { key: "open", label: "Not yet due", where: { state: "open" }, sort: ["due_on", "asc"] },
  { key: "draft", label: "Drafts to issue", where: { status: "draft" }, sort: ["issued_on", "desc"] },
  { key: "paid", label: "Paid", where: { state: "paid" }, sort: ["issued_on", "desc"] },
] as const;
const AGE_COLORS = ["#1ab394", "#e9a500", "#e76500", "#d20a0a", "#8b0000"];
const AGE_ORDER = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"];

const COLS: Col<Invoices>[] = [
  { key: "customer", label: "Customer", sort: "customer_name",
    render: (i) => <><div className="title">{i["customer.name"]}</div>{i["sales_order.number"] && <div className="sub">order {i["sales_order.number"]}</div>}</> },
  { key: "number", label: "Invoice", sort: "number", render: (i) => i.number },
  { key: "due", label: "Due", sort: "due_on",
    render: (i) => <>{date(i.due_on)}{(i.days_overdue ?? 0) > 0 && <div className="sub" style={{ color: "var(--negative)" }}>{i.days_overdue} days late</div>}</> },
  { key: "late", label: "Days late", sort: "days_overdue", num: true, render: (i) => (i.days_overdue ? i.days_overdue : "—") },
  { key: "state", label: "Status", sort: "state", render: (i) => <Status value={i.state} /> },
  { key: "amount", label: "Amount", sort: "amount", num: true, render: (i) => money(i.amount) },
  { key: "outstanding", label: "Outstanding", sort: "outstanding", num: true, render: (i) => <b>{money(i.outstanding)}</b> },
  { key: "action", label: "Action", width: 300, render: (i) => <InvoiceAction i={i} /> },
];

export const Receivables = observer(() => {
  const db = useDb();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.find((v) => v.key === params.get("view")) ?? VIEWS[0];
  const sort = useSortParam(view.sort[0], view.sort[1]);
  const aging = useCollection(db.ar_aging.all).items; // the API sends the buckets oldest-last
  const k = useCollection(db.kpis.all).items[0];
  const max = Math.max(1, ...aging.map((a) => a.dollars ?? 0));

  return (
    <Page tabs={SALES_TABS} title="Receivables" sub={<>Customers owe <b>{k?.ar_display}</b>, of which <b style={{ color: "var(--negative)" }}>{k?.ar_note}</b>.</>}>
      <div className="grid-2" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
        <div className="card card-pad">
          <h2 style={{ marginBottom: 12 }}>Aging of open receivables</h2>
          {aging.map((a, i) => (
            <div key={a.id} className="hbar">
              <span>{a.bucket}</span>
              <div className="track"><div className="fill" style={{ width: `${((a.dollars ?? 0) * 100) / max}%`, background: AGE_COLORS[AGE_ORDER.indexOf(a.bucket ?? "")] ?? AGE_COLORS[i] }} /></div>
              <span className="num"><b>{a.display}</b> <span className="faint">· {a.invoices}</span></span>
            </div>
          ))}
        </div>
        <div className="card card-pad">
          <h2 style={{ marginBottom: 6 }}>How to use this page</h2>
          <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
            Work down the <b>Overdue</b> list: send a reminder, or when the money arrives type the amount and press <b>Post</b>.
            Posting books the payment to the bank and clears the receivable in the ledger automatically. Click a column to sort.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="tabs">
          {VIEWS.map((v) => (
            // Switching view starts from that view's own order.
            <button key={v.key} className={v.key === view.key ? "on" : ""} onClick={() => setParams(v.key === "overdue" ? {} : { view: v.key }, { replace: true })}>
              {v.label}{v.key !== "paid" && <ViewCount where={v.where} />}
            </button>
          ))}
        </div>
        <InfiniteTable<Invoices> coll={db.invoices.where(view.where as never).sort(sort.col, sort.dir)} cols={COLS} noun="invoices" />
      </div>
    </Page>
  );
});

const ViewCount = observer(({ where }: { where: Record<string, unknown> }) => {
  const db = useDb();
  const n = useCount(db.invoices.where(where as never));
  return <span className="n">{n === undefined ? "" : num(n)}</span>;
});

const InvoiceAction = observer(({ i }: { i: Invoices }) => {
  const db = useDb();
  const [amount, setAmount] = useState(((i.outstanding ?? 0) / 100).toFixed(2));
  const { run, busy } = useRunner();
  const customer = i.customer.value;
  if (i.status === "draft") return <button className="btn sm primary" disabled={busy} onClick={() => run(() => i.issue_invoice(), `${i.number} issued`)}>Issue invoice</button>;
  if (i.status !== "issued" || (i.outstanding ?? 0) <= 0) return null;
  return (
    <div className="row" style={{ gap: 6 }}>
      <input className="input num" style={{ width: 110, height: 28 }} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={`Payment amount for ${i.number}`} />
      <button className="btn sm primary" disabled={busy || !(Number(amount) > 0)}
        onClick={() => run(() => db.payments.create({ invoice: i.id, amount: Math.round(Number(amount) * 100), method: "bank_transfer" } as never), `Payment of $${Number(amount).toFixed(2)} posted to ${i.number}`)}>Post</button>
      {i.state === "overdue" && customer?.email && (
        <a className="btn sm ghost" href={`mailto:${customer.email}?subject=${encodeURIComponent(`Reminder: invoice ${i.number}`)}&body=${encodeURIComponent(`Dear customer,\n\nOur invoice ${i.number} for ${money(i.amount)} was due on ${date(i.due_on)}. ${money(i.outstanding)} is still outstanding.\n\nKind regards,\nNorthwind Manufacturing`)}`}>Remind</a>
      )}
    </div>
  );
});
