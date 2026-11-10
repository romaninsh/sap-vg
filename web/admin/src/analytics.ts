// Google Analytics, on the production host only: the same GA4 property as vantage-ui.com, with the
// default cookie_domain ("auto") so a session carries across *.vantage-ui.com. Page views come
// from GA's enhanced measurement (browser history changes); this module sends none by hand.
// Anywhere else (localhost, *.run.app, e2e runs) nothing loads and track() logs to the console.

export const GA_ID = "G-R3BJYDRX24";
export const GA_HOST = "erp.demo.vantage-ui.com";

type Params = Record<string, string | number | boolean>;
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window { dataLayer?: unknown[]; gtag?: Gtag }
}

const live = () => window.location.hostname === GA_HOST;

let loaded = false;
/** Injects gtag.js once, on the production host. Called at startup and by track(). */
export function initAnalytics() {
  if (loaded || !live()) return;
  loaded = true;
  window.dataLayer = window.dataLayer ?? [];
  // gtag.js reads the `arguments` objects pushed here, not arrays
  window.gtag = function gtag() { window.dataLayer!.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { content_group: "demo-erp" });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);
}

export function track(name: string, params: Params = {}) {
  if (!live()) { console.log("[ga]", name, params); return; }
  initAnalytics();
  window.gtag!("event", name, params);
}
