import { useEffect, useRef, useState } from "react";
import { ABOUT } from "./about";
import { COMPARISON } from "./comparison";

// The first thing a browser session sees: what this app is, that it was built as a demo for
// Vantage UI, the two messages that started it, and how it was made, in measured numbers
// (about.ts). Once per session (sessionStorage); "About" in the shell bar opens it again.
//
// Same layout as smbo-vg's splash, on Vantage's dark ground, with this app's own Fiori blue and
// the teal of its logo mark in place of Vantage's indigo. Plain CSS, in styles.css under "Splash".

const SEEN = "northwind.splash.seen";

// About has its own address, /about, so a refresh reopens it. Opening it from the app pushes
// /about onto the history without telling the router, so the page underneath stays as it was;
// closing goes back to it. Landing on /about directly (a refresh, a link) shows it over the
// launchpad (main.tsx routes /about there); closing then goes to the launchpad.
const ABOUT_PATH = "/about";
const atAbout = () => window.location.pathname === ABOUT_PATH;
export const openAbout = () => {
  if (!atAbout()) window.history.pushState({ northwind_about: true }, "", ABOUT_PATH);
  window.dispatchEvent(new Event("northwind:about"));
};
function leaveAbout() {
  if (!atAbout()) return;
  if (window.history.state?.northwind_about) { window.history.back(); return; }
  window.history.replaceState(null, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate")); // the router follows to the launchpad
}

// `code` in a comparison line renders as code
const withCode = (text: string) => text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

const fmt = (n: number) => n.toLocaleString("en-GB");
const s = ABOUT.session, b = ABOUT.build, d = ABOUT.data;
const days = Math.floor(s.wallHours / 24), hours = Math.round(s.wallHours - days * 24);
const [first, second] = ABOUT.prompts;
const gap = Math.round((Date.parse(second.sent) - Date.parse(first.sent)) / 60_000);
const sentAt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(first.sent));

const STATS: [string, string, string][] = [
  [`${s.activeHours} h`, "active agent time", `over ${days} days ${hours} h, start to finish`],
  [fmt(s.prompts), "messages from the person", `${s.notTyped} of them interruptions or a context carry-over`],
  [fmt(s.modelTurns), "model turns", `${fmt(s.toolCalls)} tool calls`],
  [`${(s.outputTokens / 1e6).toFixed(2)} M`, "output tokens", `${Math.round(s.inputTokens / 1e6)} M input, ${(s.cacheReadShare * 100).toFixed(1)}% from cache`],
  [`${b.tables} · ${b.pages} · ${b.actions}`, "tables · pages · actions", `${fmt(b.yamlLines)} lines of Vantage YAML`],
  [fmt(b.webLines), "lines of web admin", `${b.webFiles} files, React + TypeScript, plain CSS`],
  [fmt(b.tests), "automated tests", `${b.e2eTests} end-to-end, ${b.unitTests} unit, and ${b.ruleChecks} database rule checks`],
  [fmt(b.issuesReported), "issues reported to Vantage", "each with its workaround"],
];

export function Splash() {
  const [open, setOpen] = useState(() => atAbout() || sessionStorage.getItem(SEEN) !== "1");
  const button = useRef<HTMLButtonElement>(null);
  const close = () => { sessionStorage.setItem(SEEN, "1"); setOpen(false); leaveAbout(); };

  useEffect(() => {
    const again = () => setOpen(true);
    // Back and Forward: arriving at /about opens it, leaving closes it
    const moved = () => setOpen(atAbout());
    window.addEventListener("northwind:about", again);
    window.addEventListener("popstate", moved);
    return () => { window.removeEventListener("northwind:about", again); window.removeEventListener("popstate", moved); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => button.current?.focus(), 50);
    // the splash has the keyboard while it shows: Enter or Esc opens the app (Enter on another
    // button or link does that one's job instead)
    const onKey = (e: KeyboardEvent) => {
      const other = e.key === "Enter" && document.activeElement !== button.current
        && document.activeElement?.matches("button, a");
      if ((e.key === "Escape" || e.key === "Enter") && !other) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey, true); };
  }, [open]);

  if (!open) return null;
  return (
    // scrolls as a whole; the inner box centres the card when it fits and starts it at the top
    // when it doesn't (flex centring alone clips a tall card on short screens)
    <div className="splash" role="dialog" aria-modal="true" aria-labelledby="splash-title">
      <div className="splash-frame">
        <div className="splash-card">
          {/* one row: the logo, and across from it what this is built with */}
          <div className="splash-top">
            <img src="/vantage-logo.svg" alt="Vantage" className="splash-logo" />
            <p className="splash-kicker">Demo built with VantageUI {ABOUT.vantageVersion}</p>
          </div>

          <div className="splash-hero">
            <div className="splash-intro">
              <div className="splash-brand"><span className="logo-mark">N</span>
                <h1 id="splash-title">Northwind ERP</h1>
              </div>
              <p className="splash-tagline">Familiar to SAP users. Easier to use.</p>
              <p className="splash-lead">
                Sales, CRM, purchasing, inventory, production, finance and HR in one ERP. Each area has its own kind of
                page: a launchpad, list reports, object pages, a kanban board, a shop-floor timeline, an org chart.
              </p>
              <p>
                An AI agent ({ABOUT.agent}) built it in Vantage UI from one person's prompts: the Vantage app (tables,
                pages and actions over SurrealDB) and this web admin on its live API.
              </p>
              <p>
                The data is a year of a made-up company, {d.company}, from {d.from} to {d.to}:{" "}
                {fmt(d.salesOrders)} sales orders, {fmt(d.invoices)} invoices, {fmt(d.purchaseOrders)} purchase orders
                and {fmt(d.workOrders)} work orders, for {d.customers} customers, {d.suppliers} suppliers and{" "}
                {d.employees} people in {d.departments} departments. There is no sign-in: anyone with the link can change it.
              </p>
              <div className="splash-buttons">
                <button ref={button} type="button" className="splash-primary" onClick={close}>Explore Demo <span aria-hidden>→</span></button>
                {/* the site's outline button: to the Vantage UI download page */}
                <a href="https://vantage-ui.com/download/" target="_blank" rel="noreferrer" className="splash-outline">
                  Build your own <span aria-hidden>↗</span>
                </a>
              </div>
              <button type="button" className="splash-jump"
                onClick={() => document.getElementById("splash-compare")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                How Vantage shortened this build <span aria-hidden>↓</span>
              </button>
            </div>

            <dl className="splash-stats">
              {STATS.map(([value, label, note], i) => (
                <div key={label} className="splash-stat" style={{ animationDelay: `${200 + i * 50}ms` }}>
                  <dd>{value}</dd>
                  <dt>{label}</dt>
                  <p>{note}</p>
                </div>
              ))}
            </dl>
          </div>

          {/* this app's own line: everything above came from these two messages */}
          <section className="splash-prompts" aria-labelledby="splash-prompts-title">
            <p className="splash-kicker" id="splash-prompts-title">What the person typed</p>
            <div className="splash-quotes">
              <figure>
                <blockquote>{first.text}</blockquote>
                <figcaption>The first message, {sentAt} UTC</figcaption>
              </figure>
              <figure>
                <blockquote>{second.text}</blockquote>
                <figcaption>The second, {gap} minutes later</figcaption>
              </figure>
            </div>
          </section>

          {/* below the fold: the dialog scrolls to it */}
          <section id="splash-compare" className="splash-compare" aria-labelledby="splash-compare-title">
            <p className="splash-kicker">Vantage vs. building it by hand</p>
            <h2 id="splash-compare-title">LLM with Vantage builds 10-times faster</h2>
            <ol>
              {COMPARISON.map((c, i) => (
                <li key={c.title}>
                  <h3><span className="splash-n">{String(i + 1).padStart(2, "0")}</span>{c.title}</h3>
                  <p className="by-hand"><span className="mark" aria-label="By hand">✕</span>
                    <span><b>By hand: </b>{withCode(c.byHand)}</span></p>
                  <p className="by-vantage"><span className="mark" aria-label="Vantage">✓</span>
                    <span><b>Vantage: </b>{withCode(c.vantage)}</span></p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
