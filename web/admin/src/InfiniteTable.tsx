import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { observer, useWindow } from "@vantage-ui/client/react";
import { num } from "./ui";

/** A column: `sort` names the server column to order by (absent: not sortable). */
export type Col<M> = { key: string; label: string; sort?: string; num?: boolean; width?: number; render: (row: M) => ReactNode };

const STEP = 40;

/**
 * A table that loads as you scroll: it reads a window from the server, and when the end of
 * the table comes near the bottom of the screen it asks for the next rows. Sorting is the
 * server's too: clicking a header re-opens the collection in that order.
 */
function InfiniteTableImpl<M extends { id: string }>({ coll, cols, onRow, noun, rowStyle, expandedId, renderExpanded }: {
  coll: Parameters<typeof useWindow>[0];
  cols: Col<M>[];
  onRow?: (row: M) => void;
  noun: string;
  rowStyle?: (row: M) => React.CSSProperties | undefined;
  /** The row whose details show in a full-width row under it. */
  expandedId?: string | null;
  renderExpanded?: (row: M) => ReactNode;
}) {
  const [count, setCount] = useState(STEP);
  // A new filter or sort is a new collection: start again from the top.
  useEffect(() => setCount(STEP), [coll]);
  const page = useWindow(coll, 0, count);
  const rows = page.items as readonly (M | undefined)[];
  const loaded = rows.filter(Boolean).length;
  const more = !page.lengthExact;

  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = end.current;
    if (!el || !more || !page.settled) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) setCount((c) => c + STEP); }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, page.settled, count]);

  return (
    <>
      {page.error && <p className="error">{page.error}</p>}
      {/* While a new order or filter is loading, the old rows stay but fade, so it's clear they're about to change. */}
      <table className="table" style={{ opacity: !page.settled && count === STEP ? 0.5 : 1, transition: "opacity .15s" }} aria-busy={!page.settled}>
        <thead><tr>{cols.map((c) => <SortHeader key={c.key} c={c} />)}</tr></thead>
        <tbody>
          {rows.map((r, i) => r ? (
            <Fragment key={r.id}>
              <tr className={onRow ? "click" : undefined} onClick={onRow ? () => onRow(r) : undefined} style={rowStyle?.(r)}>
                {cols.map((c) => <td key={c.key} className={c.num ? "num" : undefined}>{c.render(r)}</td>)}
              </tr>
              {expandedId === r.id && renderExpanded && (
                <tr><td colSpan={cols.length} style={{ background: "var(--surface-alt)", padding: "6px 14px 14px 40px" }}>{renderExpanded(r)}</td></tr>
              )}
            </Fragment>
          ) : <tr key={`gap${i}`}><td colSpan={cols.length} className="faint">…</td></tr>)}
        </tbody>
      </table>
      {page.settled && page.length === 0 && <div className="empty">Nothing matches.</div>}
      <div ref={end} className="pager">
        <span>{page.lengthExact ? `${num(page.length)} ${noun}` : `${num(loaded)} ${noun} loaded`}</span>
        <span>{more ? (page.settled ? "Scroll for more" : "Loading…") : page.length > STEP ? "That's all" : ""}</span>
      </div>
    </>
  );
}
export const InfiniteTable = observer(InfiniteTableImpl) as typeof InfiniteTableImpl;

/** The sort lives in the URL (`?sort=total&dir=desc`), so a sorted list survives a reload and can be shared. */
export function useSortParam(defaultCol: string, defaultDir: "asc" | "desc") {
  const [params] = useSearchParams();
  return { col: params.get("sort") ?? defaultCol, dir: (params.get("dir") as "asc" | "desc" | null) ?? defaultDir };
}

function SortHeader<M>({ c }: { c: Col<M> }) {
  const [params, setParams] = useSearchParams();
  if (!c.sort) return <th className={c.num ? "num" : undefined} style={{ width: c.width }}>{c.label}</th>;
  const on = params.get("sort") === c.sort;
  const dir = params.get("dir") ?? "asc";
  const click = () => {
    const p = new URLSearchParams(params);
    p.set("sort", c.sort!);
    // First click: numbers and dates biggest/newest first, text A–Z; second click flips it.
    p.set("dir", on ? (dir === "asc" ? "desc" : "asc") : c.num ? "desc" : "asc");
    setParams(p, { replace: true });
  };
  return (
    <th className={`sortable${c.num ? " num" : ""}${on ? " sorted" : ""}`} style={{ width: c.width }} onClick={click}
      aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"} title={`Sort by ${c.label.toLowerCase()}`}>
      {c.label}<span className="sort-ind">{on ? (dir === "asc" ? " ▲" : " ▼") : " ↕"}</span>
    </th>
  );
}
