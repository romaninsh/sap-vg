import { useState } from "react";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { Page, SALES_TABS } from "../Shell";
import { Avatar, date, money0, moneyShort, useRunner } from "../ui";
import type { Opportunities } from "../vantage.gen";

const STAGES = [
  { key: "lead", label: "Lead", prob: 10, color: "#8396a8" },
  { key: "qualified", label: "Qualified", prob: 25, color: "#0070f2" },
  { key: "proposal", label: "Proposal", prob: 50, color: "#0090a6" },
  { key: "negotiation", label: "Negotiation", prob: 75, color: "#e76500" },
  { key: "won", label: "Won", prob: 100, color: "#256f3a" },
  { key: "lost", label: "Lost", prob: 0, color: "#aa0808" },
] as const;
type Stage = (typeof STAGES)[number];

/** A board instead of a table: drag a deal to the next stage; the stage's default probability comes along. */
export const Pipeline = observer(() => {
  const [dragging, setDragging] = useState<Opportunities | null>(null);
  return (
    <Page tabs={SALES_TABS} title="Sales pipeline" sub="Drag a deal to another stage. Totals are the deal values in each column; weighted by probability below.">
      <div className="board">
        {STAGES.map((s) => <Lane key={s.key} s={s} dragging={dragging} setDragging={setDragging} />)}
      </div>
    </Page>
  );
});

const Lane = observer(({ s, dragging, setDragging }: { s: Stage; dragging: Opportunities | null; setDragging: (o: Opportunities | null) => void }) => {
  const db = useDb();
  const cards = useCollection(db.opportunities.where({ stage: s.key }).sort("expected_close", "asc")).items;
  const [over, setOver] = useState(false);
  const { run } = useRunner();
  const value = cards.reduce((a, o) => a + (o.value ?? 0), 0);
  const weighted = cards.reduce((a, o) => a + (o.weighted ?? 0), 0);
  const drop = () => {
    setOver(false);
    const o = dragging;
    setDragging(null);
    if (!o || o.stage === s.key) return;
    void run(() => o.patch({ stage: s.key, probability: s.prob }), `${o.title} → ${s.label}`);
  };
  return (
    <div className={`lane${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); drop(); }}>
      <div className="lane-head">
        <b style={{ color: s.color }}>{s.label} <span className="faint">{cards.length}</span></b>
        <span className="sum" title={`Weighted ${moneyShort(weighted)}`}>{moneyShort(value)}</span>
      </div>
      {cards.map((o) => (
        <div key={o.id} className="kcard" draggable style={{ borderLeftColor: s.color }} onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); setDragging(o); }}>
          <div className="t">{o.title}</div>
          <div className="m"><span>{o["customer.name"]}</span></div>
          <div className="m"><b style={{ color: "var(--text)" }}>{money0(o.value)}</b><span>{o.probability}%</span></div>
          <div className="m"><span>{date(o.expected_close)}</span><span title={o["owner.name"] ?? ""}><Avatar name={o["owner.name"]} size={20} /></span></div>
        </div>
      ))}
      {cards.length === 0 && <div className="faint" style={{ fontSize: 12, padding: 8 }}>Drop deals here</div>}
    </div>
  );
});
