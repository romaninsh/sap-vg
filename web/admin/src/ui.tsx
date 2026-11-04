import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useCollection } from "@vantage-ui/client/react";

/** A collection's rows plus whether the server has answered yet, so "nothing here" only shows when it's true. */
export function useRows<T>(coll: Parameters<typeof useCollection<T>>[0]) {
  const c = useCollection(coll);
  return { items: c.items, ready: c.loadState === "complete" || c.loadState === "partial" || c.loadState === "error" };
}

/** How many rows match, once the server's count is exact; undefined while loading or while it is only an estimate. */
export function useCount(coll: Parameters<typeof useCollection>[0]): number | undefined {
  const c = useCollection(coll);
  if (c.totalExact && c.total != null) return c.total;
  if (c.loadState === "complete") return c.items.length;
  return undefined;
}

// ── Formatting ──────────────────────────────────────────────
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("en-US");

/** Cents → "$1,234.56". */
export const money = (cents: number | null | undefined) => (cents == null ? "—" : usd.format(cents / 100));
/** Cents → "$1,235". */
export const money0 = (cents: number | null | undefined) => (cents == null ? "—" : usd0.format(cents / 100));
/** Cents → "$1.2M" / "$824K". */
export function moneyShort(cents: number | null | undefined) {
  if (cents == null) return "—";
  const d = cents / 100;
  const a = Math.abs(d);
  if (a >= 1e6) return `${d < 0 ? "−" : ""}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${d < 0 ? "−" : ""}$${Math.round(a / 1e3)}K`;
  return usd0.format(d);
}
export const num = (n: number | null | undefined) => (n == null ? "—" : int.format(n));

const dfmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const dshort = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
export const date = (iso: string | null | undefined) => (iso ? dfmt.format(new Date(iso)) : "—");
export const dateShort = (iso: string | null | undefined) => (iso ? dshort.format(new Date(iso)) : "—");
export function ago(iso: string | null | undefined) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`;
  return date(iso);
}
export const daysFromToday = (iso: string | null | undefined) =>
  iso ? Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000) : 0;
export const today = () => new Date().toISOString().slice(0, 10);

// ── Status pills (Fiori ObjectStatus) ───────────────────────
type Tone = "positive" | "critical" | "negative" | "info" | "neutral";
const STATUS: Record<string, [string, Tone]> = {
  draft: ["Draft", "neutral"], confirmed: ["Confirmed", "info"], shipped: ["Shipped", "positive"], cancelled: ["Cancelled", "neutral"],
  issued: ["Issued", "info"], void: ["Void", "neutral"], paid: ["Paid", "positive"], open: ["Open", "info"], overdue: ["Overdue", "negative"],
  due_soon: ["Due this week", "critical"], approved: ["Approved", "positive"], ordered: ["Ordered", "info"], received: ["Received", "positive"],
  planned: ["Planned", "neutral"], released: ["Released", "info"], in_progress: ["In progress", "critical"], done: ["Done", "positive"],
  pending: ["Pending", "critical"], rejected: ["Rejected", "negative"], posted: ["Posted", "positive"],
  invoiced: ["Invoiced", "positive"], to_invoice: ["To invoice", "critical"],
  ok: ["In stock", "positive"], low: ["Low stock", "critical"], out: ["Out of stock", "negative"],
  active: ["Active", "positive"], blocked: ["Blocked", "negative"], on_leave: ["On leave", "critical"], terminated: ["Left", "neutral"],
  lead: ["Lead", "neutral"], qualified: ["Qualified", "info"], proposal: ["Proposal", "info"], negotiation: ["Negotiation", "critical"],
  won: ["Won", "positive"], lost: ["Lost", "negative"],
};
export const statusLabel = (v: string | null | undefined) => (v ? STATUS[v]?.[0] ?? v : "");
export function Status({ value, label }: { value: string | null | undefined; label?: string }) {
  if (!value) return null;
  const [text, tone] = STATUS[value] ?? [value, "neutral" as Tone];
  return <span className={`status s-${tone}`}>{label ?? text}</span>;
}

export function Avatar({ name, size = 32 }: { name: string | null | undefined; size?: number }) {
  const n = name ?? "?";
  const initials = n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360;
  return <span className="avatar" style={{ width: size, height: size, background: `hsl(${h} 55% 45%)`, fontSize: size / 2.6 }}>{initials}</span>;
}

// ── Toasts ──────────────────────────────────────────────────
type Toast = { id: number; text: string; bad?: boolean };
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), bad ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status">
        {toasts.map((t) => <div key={t.id} className={`toast${t.bad ? " bad" : ""}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/** Runs a write or action and reports it: a toast on success, the server's reason on refusal. */
export function useRunner() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<{ ok: boolean; error?: { message: string } } | unknown>, done?: string) => {
    setBusy(true);
    try {
      const r = (await fn()) as { ok?: boolean; error?: { message?: string } } | undefined;
      if (r && r.ok === false) { toast(cleanError(r.error?.message), true); return false; }
      if (done) toast(done);
      return true;
    } catch (e) {
      toast(cleanError(String((e as Error)?.message ?? e)), true);
      return false;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { run, busy };
}
/** Database refusals arrive wrapped ("Error while processing event so_ship: An error occurred: Not enough …"): keep the reason. */
export function cleanError(msg: string | undefined) {
  if (!msg) return "Something went wrong";
  const m = msg.match(/An error occurred: (.*?)(["\\]|$)/) ?? msg.match(/field must conform to.*/);
  if (m && m[1]) return m[1];
  if (msg.includes("must conform")) return "That change isn't allowed in this status";
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}

// ── Dialog ──────────────────────────────────────────────────
export function Dialog({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer: ReactNode }) {
  return (
    <div className="dialog-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={title}>
        <header><h2>{title}</h2></header>
        <div className="body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

export function Drawer({ children, onClose, head }: { children: ReactNode; onClose: () => void; head: ReactNode }) {
  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head"><div className="grow">{head}</div><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

export function Facet({ k, children, big }: { k: string; children: ReactNode; big?: boolean }) {
  return <div className="facet"><div className="k">{k}</div><div className={`v${big ? " big" : ""}`}>{children}</div></div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
