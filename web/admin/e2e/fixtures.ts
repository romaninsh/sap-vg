import { test as base, expect } from "@playwright/test";

// The splash shows once per browser session; tests skip it unless they are about it.
export const test = base.extend<{ splash: boolean }>({
  splash: [false, { option: true }],
  page: async ({ page, splash }, use) => {
    if (!splash) await page.addInitScript(() => sessionStorage.setItem("northwind.splash.seen", "1"));
    await use(page);
  },
});

export { expect };
