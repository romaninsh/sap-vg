import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  // Outside `/app` (the frontend folder): results written inside it set off the watch
  // build, whose new `dist/` reloads the page under test, in a loop.
  outputDir: "/tmp/playwright-results",
  reporter: [["list"], ["html", { outputFolder: "/tmp/playwright-report", open: "never" }]],
  use: { baseURL: process.env.VANTAGE_URL },
  timeout: 45_000,
  expect: { timeout: 20_000 },
});
