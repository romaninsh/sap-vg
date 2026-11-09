// What the splash screen (Splash.tsx) says about how this app was made. Every number is
// measured, not estimated; refresh them rather than editing by hand:
//   session: python3 -I scripts/session_stats.py <the agent's session .jsonl>
//            (agent: the assistant entries' message.model in the same log)
//   prompts: the two messages quoted in README.md, as typed; `sent` is their timestamp in the log
//   code:    git ls-files counts of table/ page/ action/ api/ menu/ (*.yaml, lines summed), and of
//            web/admin/src without vantage.gen.ts (generated) and without the splash's own three
//            files (Splash.tsx, about.ts, comparison.ts)
//   tests:   test( in web/admin/e2e/pages.e2e.ts, it( in web/admin/src/*.test.ts, check in
//            tests/invariants.sh
//   issues:  "## " headings in FEEDBACK.md (as committed; the working copy no longer has it)
//   data:    CREATE statements per table in tests/seed.surql; the dates are START and TODAY in
//            tests/gen_seed.py

export const ABOUT = {
  // FEEDBACK.md was written under "Vantage 1.12.0" during the build; the app then moved to
  // 1.12.3 (Dockerfile, checks.yaml), the version the session last ran with.
  vantageVersion: "1.12.3",
  agent: "Claude Opus 5.5",
  measuredOn: "9 November 2026",
  session: {
    started: "4 November 2026",
    wallHours: 61.0,          // first to last entry of the session log
    activeHours: 2.8,         // gaps between log entries, pauses over 10 minutes left out
    prompts: 31,              // user entries with text, as the script counts them
    notTyped: 8,              // of those: 7 "[Request interrupted…]" markers and 1 context summary (read off the log)
    modelTurns: 679,
    toolCalls: 1151,
    outputTokens: 513_474,
    inputTokens: 289_442_823, // 99.5% of it read back from the prompt cache
    cacheReadShare: 0.995,
  },
  // the two messages the person typed to build it, verbatim (typos included)
  prompts: [
    {
      sent: "2026-11-04T20:41:27Z",
      text: "hi so i want to build a massive ERP system lots of features - comparable to leading ERP competition - do it please - use your own judgement. i want all the essentials in and then any custom components can be introduced later. take inspiration from SAP, but make it user-friendly.",
    },
    {
      sent: "2026-11-04T21:36:35Z",
      text: "ok, now i want you to build web admin - and make it familiar to SAP userss, but very friendly and clean at the same time. Don't use all the standard CRUD everywhere - try to approach each page differently on the web.",
    },
  ],
  build: {
    tables: 29, pages: 28, actions: 12, yamlLines: 2052,  // the Vantage app (YAML)
    apiEntities: 28,                                       // api/admin.yaml
    webFiles: 21, webLines: 2225,                          // this web admin (TypeScript, CSS)
    tests: 19, e2eTests: 14, unitTests: 5,                 // npx playwright test, npm test
    ruleChecks: 19,                                        // tests/invariants.sh, against the database
    issuesReported: 5,                                     // FEEDBACK.md, back to Vantage
  },
  data: {
    company: "Northwind Manufacturing",
    from: "5 November 2025", to: "4 November 2026",
    salesOrders: 774, invoices: 730, purchaseOrders: 160, workOrders: 745,
    customers: 42, suppliers: 14, employees: 74, departments: 34,
  },
} as const;
