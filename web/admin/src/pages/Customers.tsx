import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { observer, useCollection, useRecord, useWindow } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { Page, SALES_TABS } from "../Shell";
import { Avatar, Facet, Status, date, money, money0, useRunner } from "../ui";

const SEGMENTS: Record<string, string> = { enterprise: "Enterprise", smb: "SMB", public: "Public sector", retail: "Retail" };

/** Master–detail ("flexible column layout"): pick a customer on the left, their 360° view on the right. */
export const Customers = observer(() => {
  const db = useDb();
  const { id } = useParams();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState("");
  const where: Record<string, unknown> = {};
  if (q) where.name = { like: q };
  if (segment) where.segment = segment;
  const list = useCollection(db.customers.where(where as never).sort("revenue", "desc")).items;
  const selected = id ? decodeURIComponent(id) : list[0]?.id;

  return (
    <Page tabs={SALES_TABS} title="Customers" sub="Ranked by revenue over the last 12 months.">
      <div className="split">
        <div className="card master">
          <div className="search">
            <input className="input" style={{ width: "100%" }} placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="chips" style={{ marginTop: 10 }}>
              {["", "enterprise", "smb", "public", "retail"].map((s) => (
                <button key={s} className={`chip${segment === s ? " on" : ""}`} onClick={() => setSegment(s)}>{s ? SEGMENTS[s] : "All"}</button>
              ))}
            </div>
          </div>
          <ul>
            {list.map((c) => (
              <li key={c.id} className={c.id === selected ? "on" : ""} onClick={() => nav(`/sales/customers/${encodeURIComponent(c.id)}`)}>
                <Avatar name={c.name} size={36} />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{c.city} · {SEGMENTS[c.segment ?? ""] ?? c.segment}</div>
                </div>
                <div className="num">
                  <div style={{ fontWeight: 600 }}>{money0(c.revenue)}</div>
                  {(c.open_balance ?? 0) > 0 && <div className="muted" style={{ fontSize: 12 }}>{money0(c.open_balance)} open</div>}
                </div>
              </li>
            ))}
            {list.length === 0 && <li className="muted">No customers match.</li>}
          </ul>
        </div>
        <div className="detail">{selected ? <CustomerDetail id={selected} /> : <div className="card empty">Pick a customer.</div>}</div>
      </div>
    </Page>
  );
});

const CustomerDetail = observer(({ id }: { id: string }) => {
  const db = useDb();
  const ref = useMemo(() => db.customers.ref(id), [db, id]);
  const { value: c } = useRecord(ref);
  const orders = useWindow(db.sales_orders.where({ customer: id }).sort("order_date", "desc"), 0, 8);
  const openC = useCollection(db.invoices.where({ customer: id, state: ["open", "overdue"] }).sort("due_on", "asc"));
  const oppsC = useCollection(db.opportunities.where({ customer: id, stage: ["lead", "qualified", "proposal", "negotiation"] }));
  const open = openC.items, opps = oppsC.items;
  const loaded = (s: string) => s === "complete" || s === "partial";
  const { run, busy } = useRunner();
  if (!c) return <div className="card empty">Loading…</div>;
  const used = c.credit_limit ? Math.min(100, Math.round(((c.open_balance ?? 0) * 100) / c.credit_limit)) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card card-pad">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <Avatar name={c.name} size={56} />
          <div className="grow">
            <div className="row"><h1>{c.name}</h1><Status value={c.status} /></div>
            <div className="muted">{c.code} · {SEGMENTS[c.segment ?? ""]} · {c.city}, {c.country} · customer since {date(c.since)}</div>
            <div className="row" style={{ marginTop: 8, gap: 18, fontSize: 13 }}>
              {c.email && <a href={`mailto:${c.email}`}>✉︎ {c.email}</a>}
              {c.phone && <span>☏ {c.phone}</span>}
              <span>Account manager: <b>{c["sales_rep.name"] ?? "—"}</b></span>
            </div>
          </div>
          {c.status === "active"
            ? <button className="btn danger" disabled={busy} onClick={() => run(() => c.patch({ status: "blocked" }), `${c.name} blocked for new orders`)}>Block</button>
            : <button className="btn positive" disabled={busy} onClick={() => run(() => c.patch({ status: "active" }), `${c.name} unblocked`)}>Unblock</button>}
        </div>
        <div className="op-facets" style={{ paddingBottom: 4 }}>
          <Facet k="Revenue, 12 months" big>{money0(c.revenue)}</Facet>
          <Facet k="Open balance" big>{money0(c.open_balance)}</Facet>
          <Facet k={`Credit used (limit ${money0(c.credit_limit)})`}>
            <div className="gauge" style={{ width: 200, margin: "8px 0 2px" }}><span style={{ width: `${used}%`, background: used > 90 ? "var(--negative)" : used > 70 ? "var(--critical)" : "var(--positive)" }} /></div>
            <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{used}%</span>
          </Facet>
          <Facet k="Payment terms">{c.payment_terms ? `Net ${c.payment_terms} days` : "Prepaid"}</Facet>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-pad row" style={{ paddingBottom: 6 }}><h2 className="grow">Recent orders</h2><Link to={`/sales?customer=${encodeURIComponent(id)}`}>All orders ›</Link></div>
          <table className="table"><tbody>
            {orders.items.map((o) => o && (
              <tr key={o.id} className="click" onClick={() => location.assign(`/sales/orders/${encodeURIComponent(o.id)}`)}>
                <td><div className="title">{o.number}</div><div className="sub">{date(o.order_date)}</div></td>
                <td><Status value={o.status} /></td>
                <td className="num">{money(o.total)}</td>
              </tr>))}
          </tbody></table>
          {orders.settled ? orders.length === 0 && <div className="empty">No orders yet.</div> : <div className="empty">Loading…</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-pad" style={{ paddingBottom: 6 }}><h2>Open invoices</h2></div>
            <table className="table"><tbody>
              {open.map((i) => (
                <tr key={i.id}><td><div className="title">{i.number}</div><div className="sub">due {date(i.due_on)}</div></td><td><Status value={i.state} /></td><td className="num">{money(i.outstanding)}</td></tr>))}
            </tbody></table>
            {open.length === 0 && <div className="empty">{loaded(openC.loadState) ? "All paid up. 🎉" : "Loading…"}</div>}
          </div>
          <div className="card">
            <div className="card-pad" style={{ paddingBottom: 6 }}><h2>Opportunities</h2></div>
            <table className="table"><tbody>
              {opps.map((o) => <tr key={o.id}><td><div className="title">{o.title}</div><div className="sub">close {date(o.expected_close)}</div></td><td><Status value={o.stage} /></td><td className="num">{money0(o.value)}</td></tr>)}
            </tbody></table>
            {opps.length === 0 && <div className="empty">{loaded(oppsC.loadState) ? "No open opportunities." : "Loading…"}</div>}
          </div>
        </div>
      </div>
    </div>
  );
});
