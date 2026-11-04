import type { ReactNode } from "react";
import { Link } from "react-router";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { useInboxCount } from "../Shell";
import { LineChart, Legend, pnlSeries } from "../charts";
import { num, useCount } from "../ui";

/** A Fiori launchpad tile: title, subtitle, one big live figure. */
function Tile({ to, title, sub, value, tone, foot, wide, children }: {
  to: string; title: string; sub?: string; value?: ReactNode; tone?: "positive" | "critical" | "negative"; foot?: ReactNode; wide?: boolean; children?: ReactNode;
}) {
  return (
    <Link to={to} className={`tile${wide ? " wide" : ""}`}>
      <div className="t-title">{title}</div>
      {sub && <div className="t-sub">{sub}</div>}
      {children}
      {value !== undefined && <div className={`t-value ${tone ?? ""}`}>{value}</div>}
      {foot && <div className="t-foot">{foot}</div>}
    </Link>
  );
}


const RevenueTile = observer(() => {
  const db = useDb();
  const { labels: months, revenue: rev, costs: cost } = pnlSeries(useCollection(db.pnl_by_month.all).items);
  return (
    <Link to="/finance" className="tile wide" style={{ width: 548 }}>
      <div className="row"><div className="t-title grow">Revenue vs costs</div><Legend items={[{ name: "Revenue", color: "#0070f2" }, { name: "Costs", color: "#e76500" }]} /></div>
      <div className="t-sub">Last 12 months, from the general ledger</div>
      <div style={{ marginTop: "auto" }}>
        <LineChart labels={months} series={[{ name: "Revenue", values: rev }, { name: "Costs", values: cost }]} colors={["#0070f2", "#e76500"]} height={120} />
      </div>
    </Link>
  );
});

export const Launchpad = observer(() => {
  const db = useDb();
  const k = useCollection(db.kpis.all).items[0];
  const inbox = useInboxCount();
  const openOrders = useCount(db.sales_orders.where({ status: "confirmed" }));
  const toInvoice = useCount(db.sales_orders.where({ billing: "to_invoice" }));
  const overdue = useCount(db.invoices.where({ state: "overdue" }));
  const pipeline = useCount(db.opportunities.where({ stage: ["lead", "qualified", "proposal", "negotiation"] }));
  const deliveries = useCount(db.purchase_orders.where({ status: "ordered" }));
  const late = useCount(db.purchase_orders.where({ late: true }));
  const billsDue = useCount(db.bills.where({ state: ["due_soon", "overdue"] }));
  const low = useCount(db.products.where({ stock_state: ["low", "out"] }));
  const wip = useCount(db.work_orders.where({ status: ["released", "in_progress"] }));
  const wipLate = useCount(db.work_orders.where({ late: true }));
  const people = useCount(db.employees.where({ status: ["active", "on_leave"] }));
  const away = useCount(db.leave_requests.where({ status: "pending" }));
  const jeDrafts = useCount(db.journal_entries.where({ status: "draft" }));
  const customers = useCount(db.customers.all);
  const hour = new Date().getHours();

  return (
    <main className="page">
      <div className="hello">
        <h1>{hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"} 👋</h1>
        <div className="muted">Here's how Northwind is doing today. Everything updates live.</div>
      </div>

      <section className="lp-group">
        <h2>Today</h2>
        <div className="tiles">
          <Tile to="/inbox" title="My Inbox" sub="Approvals waiting for you" value={num(inbox)} tone={inbox > 0 ? "critical" : "positive"} foot={<span>Orders, bills, leave, entries</span>} />
          <Tile to="/sales" title="Revenue" sub="Last 30 days" value={k?.rev30_display ?? "…"} foot={<><span>{k?.rev30_change}</span><span>{k?.rev30_note}</span></>} />
          <Tile to="/sales/receivables" title="Receivables" sub={k?.ar_note ?? "Overdue"} value={k?.ar_display ?? "…"} tone="critical" foot={<span>{num(overdue)} overdue invoices</span>} />
          <Tile to="/finance" title="Cash in bank" sub="Operating account" value={k?.cash_display ?? "…"} tone="positive" foot={<span>Gross margin {k?.margin_display}</span>} />
          <RevenueTile />
        </div>
      </section>

      <section className="lp-group">
        <h2>Sales</h2>
        <div className="tiles">
          <Tile to="/sales" title="Manage sales orders" sub="Open, to ship" value={num(openOrders)} foot={<span>{k?.backlog_display} backlog</span>} />
          <Tile to="/sales?view=to_invoice" title="Billing due list" sub="Shipped, not invoiced" value={num(toInvoice)} tone={toInvoice ? "critical" : undefined} />
          <Tile to="/sales/pipeline" title="Sales pipeline" sub="Open opportunities" value={num(pipeline)} />
          <Tile to="/sales/customers" title="Customers" sub="Accounts and contacts" value={num(customers)} />
        </div>
      </section>

      <section className="lp-group">
        <h2>Supply chain</h2>
        <div className="tiles">
          <Tile to="/purchasing" title="Expected deliveries" sub="Purchase orders on the way" value={num(deliveries)} foot={<span>{num(late)} late</span>} />
          <Tile to="/purchasing/payments" title="Payment run" sub="Supplier bills due" value={num(billsDue)} tone={billsDue ? "critical" : undefined} foot={<span>{k?.ap_display} payable</span>} />
          <Tile to="/inventory" title="Stock overview" sub="Items below reorder level" value={num(low)} tone={low ? "negative" : "positive"} foot={<span>{k?.stock_display} on hand</span>} />
          <Tile to="/production" title="Shop floor" sub="Work orders in progress" value={num(wip)} foot={<span>{num(wipLate)} late</span>} />
        </div>
      </section>

      <section className="lp-group">
        <h2>Finance & people</h2>
        <div className="tiles">
          <Tile to="/finance" title="Financial statements" sub="Balance sheet, P&L" value={k?.margin_display ?? "…"} foot={<span>Gross margin</span>} />
          <Tile to="/finance/journal" title="Journal entries" sub="Drafts waiting to post" value={num(jeDrafts)} tone={jeDrafts ? "critical" : "positive"} />
          <Tile to="/people" title="Organisation" sub="Departments and people" value={num(people)} foot={<span>{num(away)} leave requests pending</span>} />
        </div>
      </section>
    </main>
  );
});
