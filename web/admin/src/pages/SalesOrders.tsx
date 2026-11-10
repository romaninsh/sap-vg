import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { Page, SALES_TABS } from "../Shell";
import { InfiniteTable, useSortParam, type Col } from "../InfiniteTable";
import { Dialog, Status, date, money, num, useCount, useRunner } from "../ui";
import { track } from "../analytics";
import type { SalesOrders as SalesOrdersModel } from "../vantage.gen";

/** "List Report" floorplan: variant tabs, a filter bar and a table that loads as you scroll; click a header to sort.
 *  Only the worklist tabs show a count: counting a big tab would load hundreds of orders just for the number. */
const VIEWS = [
  { key: "all", label: "All orders", where: {} },
  { key: "draft", label: "Drafts", where: { status: "draft" } },
  { key: "open", label: "To ship", where: { status: "confirmed" } },
  { key: "to_invoice", label: "To invoice", where: { billing: "to_invoice" } },
  { key: "shipped", label: "Shipped", where: { status: "shipped" } },
] as const;

const COLS: Col<SalesOrdersModel>[] = [
  { key: "number", label: "Order", sort: "number", render: (o) => <><div className="title">{o.number}</div><div className="sub">{o.customer_ref}</div></> },
  { key: "customer", label: "Customer", sort: "customer_name", render: (o) => o["customer.name"] },
  { key: "ordered", label: "Ordered", sort: "order_date", render: (o) => date(o.order_date) },
  { key: "requested", label: "Requested delivery", sort: "requested_on", render: (o) => date(o.requested_on) },
  { key: "status", label: "Status", sort: "status", render: (o) => <Status value={o.status} /> },
  { key: "billing", label: "Billing", sort: "billing", render: (o) => <Status value={o.billing} /> },
  { key: "lines", label: "Items", sort: "line_count", num: true, render: (o) => o.line_count },
  { key: "total", label: "Net value", sort: "total", num: true, render: (o) => <b>{money(o.total)}</b> },
];

const ViewCount = observer(({ where }: { where: Record<string, unknown> }) => {
  const db = useDb();
  const n = useCount(db.sales_orders.where(where as never));
  return <span className="n">{n === undefined ? "" : num(n)}</span>;
});

export const SalesOrders = observer(() => {
  const db = useDb();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.find((v) => v.key === params.get("view")) ?? VIEWS[0];
  const customer = params.get("customer") ?? "";
  const numberQ = params.get("q") ?? "";
  const [creating, setCreating] = useState(false);
  const customers = useCollection(db.customers.sort("name", "asc")).items;
  const sort = useSortParam("order_date", "desc");

  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };
  const where: Record<string, unknown> = { ...view.where };
  if (customer) where.customer = customer;
  if (numberQ) where.number = { like: numberQ };
  const coll = db.sales_orders.where(where as never).sort(sort.col, sort.dir);

  return (
    <Page tabs={SALES_TABS} title="Sales orders" sub="Every customer order, from draft to shipped and invoiced."
      actions={<button className="btn primary" onClick={() => setCreating(true)}>＋ Create order</button>}>
      <div className="card">
        <div className="filterbar">
          <div className="field"><label>Order number</label><input className="input" placeholder="e.g. SO-10420" value={numberQ} onChange={(e) => set("q", e.target.value)} /></div>
          <div className="field" style={{ minWidth: 260 }}><label>Customer</label>
            <select className="select" value={customer} onChange={(e) => set("customer", e.target.value)}>
              <option value="">All customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {(customer || numberQ) && <button className="btn ghost" onClick={() => { const p = new URLSearchParams(params); p.delete("customer"); p.delete("q"); setParams(p); }}>Clear filters</button>}
        </div>
        <div className="tabs">
          {VIEWS.map((v) => (
            <button key={v.key} className={v.key === view.key ? "on" : ""} onClick={() => set("view", v.key === "all" ? "" : v.key)}>
              {v.label}{(v.key === "draft" || v.key === "open" || v.key === "to_invoice") && <ViewCount where={{ ...v.where, ...(customer ? { customer } : {}) }} />}
            </button>
          ))}
        </div>
        <InfiniteTable<SalesOrdersModel> coll={coll} noun="orders" cols={COLS} onRow={(o) => nav(`/sales/orders/${encodeURIComponent(o.id)}`)} />
      </div>
      {creating && <CreateOrder onClose={() => setCreating(false)} />}
    </Page>
  );
});

const CreateOrder = observer(({ onClose }: { onClose: () => void }) => {
  const db = useDb();
  const nav = useNavigate();
  const customers = useCollection(db.customers.where({ status: "active" }).sort("name", "asc")).items;
  const [customer, setCustomer] = useState("");
  const [ref, setRef] = useState("");
  const { run, busy } = useRunner();
  const create = async () => {
    let id = "";
    const ok = await run(async () => {
      const r = await db.sales_orders.create({ customer, customer_ref: ref || null, status: "draft" } as never);
      if (r.ok) id = r.value.id;
      return r;
    });
    if (ok) track("demo_action", { action: "create_sales_order" });
    if (ok && id) nav(`/sales/orders/${encodeURIComponent(id)}`);
  };
  return (
    <Dialog title="Create sales order" onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!customer || busy} onClick={create}>Create and add items</button>
    </>}>
      <div className="field"><label>Sold-to customer</label>
        <select className="select" value={customer} onChange={(e) => setCustomer(e.target.value)} autoFocus>
          <option value="">Choose a customer…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.city}</option>)}
        </select>
      </div>
      <div className="field"><label>Customer reference (their PO number)</label><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
      <p className="muted" style={{ margin: 0 }}>The order starts as a draft. Prices come from the price list; the number is assigned automatically.</p>
    </Dialog>
  );
});
