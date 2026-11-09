import { expect, test } from "./fixtures";

// The splash: once per browser session, about the VantageUI demo and the two messages that
// started it, out of the way with Enter or "Explore Demo", back from the About button.
test.use({ splash: true });

const splashOf = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Northwind ERP" });
const shellBar = (page: import("@playwright/test").Page) => page.getByRole("banner");

test("a new session opens on the splash, once", async ({ page }) => {
  await page.goto("/sales");
  const splash = splashOf(page);
  await expect(splash).toBeVisible();
  await expect(splash).toContainText("Demo built with VantageUI 1.12.3");
  await expect(splash).toContainText("active agent time");
  await expect(splash).toContainText("hi so i want to build a massive ERP system");
  await expect(splash).toContainText("ok, now i want you to build web admin");
  await expect(splash.getByRole("link", { name: /Build your own/ })).toHaveAttribute("href", "https://vantage-ui.com/download/");
  await page.keyboard.press("Enter");
  await expect(splash).toBeHidden();

  await page.reload();
  await expect(shellBar(page)).toBeVisible();
  await expect(splashOf(page)).toBeHidden();

  await shellBar(page).getByRole("button", { name: "About this demo" }).click();
  await expect(splashOf(page)).toBeVisible();
  await page.getByRole("button", { name: /Explore Demo/ }).click();
  await expect(splashOf(page)).toBeHidden();
  await expect(page).toHaveURL(/\/sales$/);
});

test("About has its own address: /about, kept on refresh, gone on close", async ({ page }) => {
  await page.goto("/purchasing");
  await page.keyboard.press("Enter"); // the session's first splash
  await expect(splashOf(page)).toBeHidden();

  await shellBar(page).getByRole("button", { name: "About this demo" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await page.reload();
  await expect(splashOf(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(splashOf(page)).toBeHidden();
  await expect(page).toHaveURL(/\/purchasing$/); // back to the page it was opened from
  await page.goForward();
  await expect(splashOf(page)).toBeVisible(); // Forward reopens it

  // a link straight to /about (from another page: a goto to the same address keeps its state)
  await page.goto("/finance");
  await page.goto("/about");
  await expect(splashOf(page)).toBeVisible();
  await page.getByRole("button", { name: /Explore Demo/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Manage sales orders")).toBeVisible(); // the launchpad
});
