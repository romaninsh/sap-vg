import { useState } from "react";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { Page } from "../Shell";
import { Avatar, Drawer, Facet, Status, date, money0, num } from "../ui";
import type { Departments } from "../vantage.gen";

/** The organisation as a chart, the way people draw it on a whiteboard. Click a box for the team. */
export const People = observer(() => {
  const db = useDb();
  const depts = useCollection(db.departments.sort("rank", "asc")).items;
  const [open, setOpen] = useState<Departments | null>(null);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  // Build the tree from the parent links (the server sends siblings in their order).
  const kids = new Map<string, Departments[]>();
  for (const d of depts) {
    const p = d.parent.id ?? "";
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p)!.push(d);
  }
  const subtree = (id: string): { people: number; payroll: number } => {
    const d = depts.find((x) => x.id === id);
    const own = { people: d?.headcount ?? 0, payroll: d?.payroll_usd ?? 0 };
    for (const c of kids.get(id) ?? []) { const s = subtree(c.id); own.people += s.people; own.payroll += s.payroll; }
    return own;
  };
  const toggle = (id: string) => setFolded((f) => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const Node = ({ d, depth }: { d: Departments; depth: number }) => {
    const children = kids.get(d.id) ?? [];
    const t = subtree(d.id);
    // The top two levels show at first; deeper teams open on click.
    const isFolded = folded.has(d.id) || (depth >= 1 && !folded.has("open:" + d.id));
    return (
      <li>
        <div className={`onode${open?.id === d.id ? " on" : ""}`} onClick={() => setOpen(d)} style={{ borderTopColor: depth === 0 ? "#5d36ff" : depth === 1 ? "#0070f2" : "#1ab394" }}>
          <div className="n">{d.name}</div>
          <div className="h">{d["head.name"] ?? "No head"}</div>
          <div className="f"><span>👤 {t.people}</span><span>{d.cost_center}</span></div>
          {children.length > 0 && (
            <button className="fold" onClick={(e) => { e.stopPropagation(); if (depth >= 1) toggle("open:" + d.id); else toggle(d.id); }}>
              {isFolded ? `▸ ${children.length} teams` : "▾ hide teams"}
            </button>
          )}
        </div>
        {children.length > 0 && !isFolded && <ul>{children.map((c) => <Node key={c.id} d={c} depth={depth + 1} />)}</ul>}
      </li>
    );
  };
  const roots = kids.get("") ?? [];
  return (
    <Page title="Organisation" sub="Departments as they report to each other. Numbers include every team underneath.">
      <div className="card org">
        <ul>{roots.map((r) => <Node key={r.id} d={r} depth={0} />)}</ul>
      </div>
      {open && <TeamDrawer d={open} total={subtree(open.id)} onClose={() => setOpen(null)} />}
    </Page>
  );
});

const TeamDrawer = observer(({ d, total, onClose }: { d: Departments; total: { people: number; payroll: number }; onClose: () => void }) => {
  const db = useDb();
  const people = useCollection(db.employees.where({ department: d.id }).sort("name", "asc")).items;
  return (
    <Drawer onClose={onClose} head={<><div className="faint">{d.cost_center}{d["parent"].value ? ` · reports to ${d.parent.value?.name}` : ""}</div><h2 style={{ fontSize: 20 }}>{d.name}</h2></>}>
      <div className="op-facets" style={{ paddingTop: 0 }}>
        <Facet k="Head">{d["head.name"] ?? "—"}</Facet>
        <Facet k="People (incl. teams)">{num(total.people)}</Facet>
        <Facet k="Payroll (incl. teams)">{money0(total.payroll * 100)}</Facet>
        <Facet k="Own budget">{money0(d.budget)}</Facet>
      </div>
      <h3 style={{ margin: "0 0 10px" }}>In this department</h3>
      <div className="people">
        {people.map((p) => (
          <div key={p.id} className="card person">
            <Avatar name={p.name} size={40} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{p.title}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}><a href={`mailto:${p.email}`}>{p.email}</a></div>
              <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>since {date(p.hired_on)} {p.status !== "active" && <Status value={p.status} />}</div>
            </div>
          </div>
        ))}
        {people.length === 0 && <div className="muted">No one directly in this department — see its teams.</div>}
      </div>
    </Drawer>
  );
});
