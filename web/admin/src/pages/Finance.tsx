import { useState } from "react";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { FINANCE_TABS, Page } from "../Shell";
import { LineChart, Legend, pnlSeries } from "../charts";
import { InfiniteTable, useSortParam, type Col } from "../InfiniteTable";
import { Status, date, money, money0, useRunner } from "../ui";
import type { GlAccounts, JournalEntries } from "../vantage.gen";

const KIND = ["asset", "liability", "equity", "revenue", "expense"] as const;
type Kind = (typeof KIND)[number];

function useAccounts(kind: Kind) {
  const db = useDb();
  return useCollection(db.gl_accounts.where({ kind }).sort("code", "asc")).items;
}
const sum = (rows: readonly GlAccounts[]) => rows.reduce((a, r) => a + (r.balance ?? 0), 0);

function Lines({ title, rows, total, label }: { title: string; rows: readonly GlAccounts[]; total: number; label: string }) {
  return (
    <>
      <tr className="group"><td colSpan={2}>{title}</td></tr>
      {rows.map((r) => <tr key={r.id} className="indent"><td><span className="faint">{r.code}</span>&nbsp; {r.name}</td><td className="num">{money0(r.balance)}</td></tr>)}
      <tr><td className="muted"><i>{label}</i></td><td className="num"><b>{money0(total)}</b></td></tr>
    </>
  );
}

/** Financial statements laid out like the printed report, built live from the ledger. */
export const Statements = observer(() => {
  const db = useDb();
  const assets = useAccounts("asset"), liabs = useAccounts("liability"), equity = useAccounts("equity");
  const revenue = useAccounts("revenue"), expense = useAccounts("expense");
  const net = sum(revenue) - sum(expense);
  const { labels: months, revenue: rev, costs: cost } = pnlSeries(useCollection(db.pnl_by_month.all).items);
  return (
    <Page tabs={FINANCE_TABS} title="Financial statements" sub="Live from the general ledger. Every shipment, invoice, bill and payment posts here automatically.">
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row"><h2 className="grow">Revenue vs costs by month</h2><Legend items={[{ name: "Revenue", color: "#0070f2" }, { name: "Costs", color: "#e76500" }]} /></div>
        <LineChart labels={months} series={[{ name: "Revenue", values: rev }, { name: "Costs", values: cost }]} colors={["#0070f2", "#e76500"]} height={220} width={1300} />
      </div>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-pad" style={{ paddingBottom: 0 }}><h2>Balance sheet</h2><div className="muted">as of {date(new Date().toISOString())}</div></div>
          <table className="table stmt"><tbody>
            <Lines title="Assets" rows={assets} total={sum(assets)} label="Total assets" />
            <Lines title="Liabilities" rows={liabs} total={sum(liabs)} label="Total liabilities" />
            <Lines title="Equity" rows={equity} total={sum(equity)} label="Total paid-in & retained" />
            <tr className="indent"><td>Current year earnings</td><td className="num">{money0(net)}</td></tr>
            <tr className="total"><td>Liabilities and equity</td><td className="num">{money0(sum(liabs) + sum(equity) + net)}</td></tr>
          </tbody></table>
        </div>
        <div className="card">
          <div className="card-pad" style={{ paddingBottom: 0 }}><h2>Profit and loss</h2><div className="muted">since the opening balance</div></div>
          <table className="table stmt"><tbody>
            <Lines title="Revenue" rows={revenue} total={sum(revenue)} label="Total revenue" />
            <Lines title="Expenses" rows={expense} total={sum(expense)} label="Total expenses" />
            <tr className="total"><td>Net income</td><td className="num" style={{ color: net >= 0 ? "var(--positive)" : "var(--negative)" }}>{money0(net)}</td></tr>
            <tr><td className="muted">Net margin</td><td className="num muted">{sum(revenue) ? `${Math.round((net * 100) / sum(revenue))}%` : "—"}</td></tr>
          </tbody></table>
        </div>
      </div>
    </Page>
  );
});

const SOURCES = ["", "sales", "purchasing", "inventory", "payroll", "manual", "opening"];

/** The journal as an accordion: one line per entry, expand to see its postings. */
export const Journal = observer(() => {
  const db = useDb();
  const [source, setSource] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const sort = useSortParam("number", "desc");
  const coll = (source ? db.journal_entries.where({ source }) : db.journal_entries.all).sort(sort.col, sort.dir);
  const cols: Col<JournalEntries>[] = [
    { key: "number", label: "Entry", sort: "number", render: (e) => <b>{open === e.id ? "▾" : "▸"} {e.number}</b> },
    { key: "date", label: "Date", sort: "posted_on", render: (e) => date(e.posted_on) },
    { key: "memo", label: "Memo", sort: "memo", render: (e) => e.memo },
    { key: "source", label: "Source", sort: "source", render: (e) => <span className="muted">{e.source}</span> },
    { key: "status", label: "Status", sort: "status", render: (e) => <Status value={e.status} /> },
    { key: "amount", label: "Amount", sort: "total_debit", num: true, render: (e) => money(e.total_debit) },
  ];
  return (
    <Page tabs={FINANCE_TABS} title="Journal" sub="Every posting, newest first. Click an entry to see its debit and credit lines; click a column to sort.">
      <div className="chips" style={{ marginBottom: 14 }}>
        {SOURCES.map((s) => <button key={s} className={`chip${source === s ? " on" : ""}`} onClick={() => setSource(s)}>{s ? s[0]!.toUpperCase() + s.slice(1) : "All sources"}</button>)}
      </div>
      <div className="card">
        <InfiniteTable<JournalEntries> coll={coll} cols={cols} noun="entries" onRow={(e) => setOpen(open === e.id ? null : e.id)}
          expandedId={open} renderExpanded={(e) => <EntryLines e={e} />} />
      </div>
    </Page>
  );
});

const EntryLines = observer(({ e }: { e: JournalEntries }) => {
  const db = useDb();
  const lines = useCollection(db.journal_lines.where({ entry: e.id })).items;
  const { run, busy } = useRunner();
  return (
    <>
      <table className="table" style={{ background: "transparent" }}>
        <thead><tr><th>Account</th><th>Note</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
        <tbody>{lines.map((l) => (
          <tr key={l.id}><td><span className="faint">{l["account.code"]}</span> {l["account.name"]}</td><td className="muted">{l.memo}</td>
            <td className="num">{l.debit ? money(l.debit) : ""}</td><td className="num">{l.credit ? money(l.credit) : ""}</td></tr>))}
        </tbody>
      </table>
      {e.status === "draft" && (
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          {!e.balanced && <span className="status s-negative">Debits and credits don't match</span>}
          <button className="btn primary sm" disabled={busy || !e.balanced} onClick={() => run(() => e.post_entry(), `${e.number} posted`)}>Post entry</button>
        </div>
      )}
    </>
  );
});
