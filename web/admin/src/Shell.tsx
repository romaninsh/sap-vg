import type { ReactNode } from "react";
import { NavLink, Link, Outlet } from "react-router";
import { observer, useConnection } from "@vantage-ui/client/react";
import { useDb } from "./db";
import { Avatar, useCount } from "./ui";
import { openAbout } from "./Splash";

const AREAS = [
  { to: "/sales", label: "Sales" },
  { to: "/purchasing", label: "Purchasing" },
  { to: "/inventory", label: "Inventory" },
  { to: "/production", label: "Production" },
  { to: "/finance", label: "Finance" },
  { to: "/people", label: "People" },
];

/** Count of open approval tasks, for the Inbox badge. */
export const useInboxCount = () => {
  const db = useDb();
  const a = useCount(db.purchase_orders.where({ status: "draft" })) ?? 0;
  const b = useCount(db.bills.where({ status: "draft" })) ?? 0;
  const c = useCount(db.leave_requests.where({ status: "pending" })) ?? 0;
  const d = useCount(db.journal_entries.where({ status: "draft" })) ?? 0;
  return a + b + c + d;
};

const InboxLink = observer(() => {
  const n = useInboxCount();
  return (
    <NavLink to="/inbox" className="btn ghost" aria-label="My Inbox">
      ✉︎ Inbox {n > 0 && <span className="status s-negative" style={{ padding: "0 8px" }}>{n}</span>}
    </NavLink>
  );
});

export const Shell = observer(() => {
  const { status } = useConnection();
  return (
    <>
      <header className="shell">
        <Link to="/" className="logo"><span className="logo-mark">N</span>Northwind ERP</Link>
        <nav>
          {AREAS.map((a) => <NavLink key={a.to} to={a.to} className={({ isActive }) => (isActive ? "active" : "")}>{a.label}</NavLink>)}
        </nav>
        <div className="spacer" />
        <span className="live" title="Changes from colleagues appear here as they happen">
          <span className={`dot${status === "open" ? "" : " off"}`} />{status === "open" ? "Live" : "Reconnecting…"}
        </span>
        <InboxLink />
        <button type="button" className="btn ghost" title="About this demo" aria-label="About this demo" onClick={openAbout}>ⓘ About</button>
        <Avatar name="Office Admin" />
      </header>
      <Outlet />
    </>
  );
});

/** Sub-navigation inside an area (Fiori "icon tab bar" style). */
export function AreaTabs({ tabs }: { tabs: { to: string; label: string }[] }) {
  return (
    <div className="tabs" style={{ marginBottom: 18, background: "transparent", padding: 0 }}>
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end className={({ isActive }) => (isActive ? "on" : "")}
          style={({ isActive }) => ({ padding: "10px 12px", fontWeight: 600, color: isActive ? "var(--brand)" : "var(--text-muted)",
            borderBottom: `3px solid ${isActive ? "var(--brand)" : "transparent"}`, textDecoration: "none" })}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

export function Page({ title, sub, actions, children, tabs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; tabs?: { to: string; label: string }[] }) {
  return (
    <main className="page">
      {tabs && <AreaTabs tabs={tabs} />}
      <div className="page-head">
        <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
        {actions && <div className="actions">{actions}</div>}
      </div>
      {children}
    </main>
  );
}

export const SALES_TABS = [
  { to: "/sales", label: "Sales orders" },
  { to: "/sales/customers", label: "Customers" },
  { to: "/sales/pipeline", label: "Pipeline" },
  { to: "/sales/receivables", label: "Receivables" },
];
export const PURCHASING_TABS = [
  { to: "/purchasing", label: "Deliveries" },
  { to: "/purchasing/payments", label: "Payment run" },
  { to: "/purchasing/suppliers", label: "Suppliers" },
];
export const FINANCE_TABS = [
  { to: "/finance", label: "Financial statements" },
  { to: "/finance/journal", label: "Journal" },
];
