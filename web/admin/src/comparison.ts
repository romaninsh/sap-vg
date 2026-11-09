// "LLM with Vantage builds 10-times faster", on the splash below the stats: each thing this ERP
// needed, how a hand-built backend (Express, a database driver, a WebSocket server) would have to
// do it, and what it took here. Every Vantage line names something in this repository; the counts
// were measured on 9 November 2026 (api/admin.yaml, table/, page/, action/, application.yaml,
// src/vantage.gen.ts, src/InfiniteTable.tsx, Dockerfile, .github/workflows/).
// The hand-built side is what you'd have to write, not an estimate of hours.

export type Comparison = { title: string; byHand: string; vantage: string };

export const COMPARISON: Comparison[] = [
  {
    title: "Lists and tiles update while you look",
    byHand: "A WebSocket server, a subscription per open list, change capture from the database, diffs per client, reconnect and replay.",
    vantage: "Every entity in `api/admin.yaml` is live. The \"Live\" dot in the shell bar is the only code for it.",
  },
  {
    title: "The cockpit: KPIs, aging, P&L by month, top customers",
    byHand: "A SQL view or aggregate query per tile, an endpoint for each, a cache, and a timer to recompute.",
    vantage: "Five query tables in `table/`, served like any list; `api: { refresh: 30 }` re-runs them on a timer.",
  },
  {
    title: "Derived columns: outstanding, overdue, stock state, margin",
    byHand: "The same SQL repeated in every endpoint that lists, filters or sorts by them, kept in step by hand.",
    vantage: "One `expr:` per column in the table's YAML; every list, filter and sort uses it. 41 such columns here.",
  },
  {
    title: "The API itself",
    byHand: "Routes, request validation and response shapes for 28 resources.",
    vantage: "`api/admin.yaml`: 28 entities in 190 lines.",
  },
  {
    title: "A typed client for the web admin",
    byHand: "An OpenAPI spec and a client, kept in step with the server by hand.",
    vantage: "Generated from the API's schema: 4,276 lines of TypeScript, never edited. A renamed column fails the build.",
  },
  {
    title: "Thousands of orders: scroll, sort, count",
    byHand: "Cursor paging, sort-parameter parsing, an allow-list of filters, and a separate count query per tab.",
    vantage: "`filter:` lists per entity. `InfiniteTable.tsx` (96 lines) asks for the next window with `.sort()`; tab counts come from the server.",
  },
  {
    title: "Document steps: confirm, goods issue, approve, post",
    byHand: "An endpoint per step, a status check in each, and the same rules again for a second front end.",
    vantage: "The web buttons call the desktop pages' row actions by name, 14 of them. Each row arrives with the actions its status allows.",
  },
  {
    title: "An MRP run that drafts purchase orders",
    byHand: "A job endpoint, its transaction handling, and a way to report the result back to the page.",
    vantage: "`action/reorder-low-stock.yaml`, 25 lines, shared by the desktop Products toolbar and the web's Run MRP button.",
  },
  {
    title: "Change history on every order",
    byHand: "Triggers or middleware on every write, a log table, and an endpoint to read it.",
    vantage: "6 lines in `application.yaml`. The sales order page reads it as an ordinary list.",
  },
  {
    title: "A back-office desktop app as well",
    byHand: "A second front end, or a paid admin tool wired to the database.",
    vantage: "The desktop app, from the same tables: 28 pages, a menu and 12 actions.",
  },
  {
    title: "Local, CI and production settings",
    byHand: "A config loader and per-environment secret handling.",
    vantage: "Three profiles in `application.yaml`; one 7-line datasource file reads them.",
  },
  {
    title: "Serving and deploying it",
    byHand: "Images for the API and the front end, static hosting with deep-link fallback, and a health check that knows the database is up.",
    vantage: "One 26-line `Dockerfile` on vantage-server, serving the built admin on the API's origin; Cloud Run waits on `/v1/ready`.",
  },
  {
    title: "Checks on every pull request",
    byHand: "A test server to stand up in CI, with its own config and a way to know when it's ready.",
    vantage: "`checks.yaml` runs vantage-server with the `ci` profile against a throwaway SurrealDB.",
  },
  {
    title: "A dropped connection",
    byHand: "Reconnect with backoff, re-subscribe every list, catch up on what was missed.",
    vantage: "Built into the client; the shell bar only shows \"Reconnecting…\" while it's down.",
  },
  {
    title: "The development loop",
    byHand: "Node on the machine, a watcher, a dev proxy, reloading the tab by hand.",
    vantage: "The web-dev container, started from the Services panel, rebuilds on every save and reloads the open tab.",
  },
  {
    title: "The agent checking its own work",
    byHand: "Reading code and screenshots, and guessing what the server did.",
    vantage: "MCP tools to run queries, preview the SurrealQL, read the logs and drive the running app.",
  },
];
