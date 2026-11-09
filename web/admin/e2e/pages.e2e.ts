import { expect, test } from "./fixtures";

// Read-only tour of every screen against the live API: each page loads real rows from the server.
// Nothing here writes, so the data is the same afterwards.

test("launchpad shows live tiles and the revenue chart", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Manage sales orders")).toBeVisible();
  await expect(page.locator(".tile .t-value").first()).toHaveText(/\d/);
  await expect(page.locator("svg polyline")).toHaveCount(2);
});

test("sales orders: list report, a variant tab narrows the rows, a row opens the object page", async ({ page }) => {
  await page.goto("/sales");
  const rows = page.locator("table.table tbody tr.click");
  await expect(rows.first()).toBeVisible();
  await page.getByRole("button", { name: /^Shipped/ }).click();
  await expect(page.locator("table.table tbody tr.click .status").first()).toHaveText("Shipped");
  await rows.first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Sales order SO-\d+/);
  await expect(page.getByLabel("Document flow")).toContainText("Goods issue");
  await expect(page.locator("table.table").first().locator("tbody tr").first()).toBeVisible();
});

test("sales orders load more rows as you scroll", async ({ page }) => {
  await page.goto("/sales");
  const rows = page.locator("table.table tbody tr.click");
  await expect(rows).toHaveCount(40);
  await page.getByText("Scroll for more").scrollIntoViewIfNeeded();
  await expect(rows).toHaveCount(80);
  await page.getByText("Scroll for more").scrollIntoViewIfNeeded();
  await expect(rows).toHaveCount(120);
});

const money = (s: string) => Number(s.replace(/[^0-9.]/g, ""));
/** The first n cell texts of a column, once the server's re-sorted rows have replaced the old ones. */
async function firstCells(page: import("@playwright/test").Page, nthChild: string, n: number) {
  await expect(page.locator("table.table[aria-busy=false]")).toBeVisible();
  return (await page.locator(`table.table tbody tr.click td:${nthChild}`).allInnerTexts()).slice(0, n);
}
const isSorted = <T,>(xs: T[], cmp: (a: T, b: T) => number) => xs.every((x, i) => i === 0 || cmp(xs[i - 1]!, x) <= 0);

test("sales orders sort by a clicked column, on the server", async ({ page }) => {
  await page.goto("/sales");
  const header = page.getByRole("columnheader", { name: /Net value/ });
  await header.click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(page).toHaveURL(/sort=total&dir=desc/);
  await expect.poll(async () => isSorted((await firstCells(page, "last-child", 8)).map(money), (a, b) => b - a)).toBe(true);
  const top = (await firstCells(page, "last-child", 1)).map(money);

  await header.click();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expect.poll(async () => isSorted((await firstCells(page, "last-child", 8)).map(money), (a, b) => a - b)).toBe(true);
  const low = (await firstCells(page, "last-child", 1)).map(money);
  expect(low[0]!).toBeLessThan(top[0]!);

  await page.getByRole("columnheader", { name: /Customer/ }).click();
  await expect(page).toHaveURL(/sort=customer_name&dir=asc/);
  await expect.poll(async () => isSorted(await firstCells(page, "nth-child(2)", 8), (a, b) => a.localeCompare(b))).toBe(true);
});

test("journal loads as you scroll and sorts by amount", async ({ page }) => {
  await page.goto("/finance/journal");
  const rows = page.locator("table.table tbody tr.click");
  await expect(rows).toHaveCount(40);
  await page.getByText("Scroll for more").scrollIntoViewIfNeeded();
  await expect(rows).toHaveCount(80);
  await page.getByRole("columnheader", { name: /Amount/ }).click();
  await expect.poll(async () => isSorted((await firstCells(page, "last-child", 8)).map(money), (a, b) => b - a)).toBe(true);
});

test("customers: master–detail shows the selected customer's 360° view", async ({ page }) => {
  await page.goto("/sales/customers");
  await expect(page.locator(".master li").first()).toBeVisible();
  await page.locator(".master li").nth(1).click();
  await expect(page.locator(".detail h1")).toBeVisible();
  await expect(page.getByText("Revenue, 12 months")).toBeVisible();
});

test("pipeline board has six stages with deals", async ({ page }) => {
  await page.goto("/sales/pipeline");
  await expect(page.locator(".lane")).toHaveCount(6);
  await expect(page.locator(".kcard").first()).toBeVisible();
});

test("receivables: aging buckets and the overdue worklist", async ({ page }) => {
  await page.goto("/sales/receivables");
  await expect(page.locator(".hbar").first()).toBeVisible();
  await expect(page.locator("table.table tbody tr").first()).toContainText(/days late/);
});

test("inbox lists tasks per kind", async ({ page }) => {
  await page.goto("/inbox");
  await expect(page.locator(".inbox-nav button")).toHaveCount(4);
  await page.locator(".inbox-nav button", { hasText: "Leave requests" }).click();
  await expect(page.getByRole("heading", { name: "Leave requests" })).toBeVisible();
});

test("purchasing: deliveries, payment run and suppliers", async ({ page }) => {
  await page.goto("/purchasing");
  await expect(page.getByRole("heading", { name: "Recently received" })).toBeVisible();
  await page.goto("/purchasing/payments");
  await expect(page.getByRole("button", { name: /Execute payment run/ })).toBeVisible();
  await page.goto("/purchasing/suppliers");
  await expect(page.locator(".cards .card").first()).toBeVisible();
});

test("inventory cards open a product drawer with movements", async ({ page }) => {
  await page.goto("/inventory");
  await expect(page.locator(".pcard").first()).toBeVisible();
  await page.locator(".pcard").first().click();
  await expect(page.getByRole("heading", { name: "Recent movements" })).toBeVisible();
  await expect(page.locator(".drawer table.table tbody tr").first()).toBeVisible();
});

test("shop floor timeline shows work orders", async ({ page }) => {
  await page.goto("/production");
  await expect(page.locator(".gantt-bar").first()).toBeVisible();
});

test("finance: statements balance, journal expands", async ({ page }) => {
  await page.goto("/finance");
  await expect(page.getByText("Total assets")).toBeVisible();
  await expect(page.locator("tr", { hasText: "Total assets" })).toContainText(/\$[1-9]/);
  await page.goto("/finance/journal");
  await page.locator("table.table tbody tr.click").first().click();
  await expect(page.getByRole("columnheader", { name: "Debit" })).toBeVisible();
});

test("organisation chart opens a team panel", async ({ page }) => {
  await page.goto("/people");
  await expect(page.locator(".onode").first()).toBeVisible();
  await page.locator(".onode", { hasText: "Operations" }).click();
  await expect(page.getByRole("heading", { name: "In this department" })).toBeVisible();
});
