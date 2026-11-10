import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";

// analytics.ts keeps "already loaded" in module state: each test imports a fresh copy
const load = async (hostname: string) => {
  vi.stubGlobal("location", { ...window.location, hostname });
  vi.resetModules();
  return import("./analytics");
};

let append: MockInstance<(node: Node) => Node>;
beforeEach(() => {
  append = vi.spyOn(document.head, "appendChild").mockImplementation((n) => n);
  delete window.gtag;
  delete window.dataLayer;
});
afterEach(() => vi.unstubAllGlobals());

test("track() off the production host logs and loads nothing", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const { track } = await load("erp-demo-abc.a.run.app");
  track("demo_action", { action: "confirm_order" });
  expect(log).toHaveBeenCalledWith("[ga]", "demo_action", { action: "confirm_order" });
  expect(append).not.toHaveBeenCalled();
  expect(window.gtag).toBeUndefined();
});

test("track() on the production host loads gtag once and sends the event", async () => {
  const { track, GA_ID } = await load("erp.demo.vantage-ui.com");
  track("about_open", { trigger: "link" });
  track("outbound_click", { link_url: "https://vantage-ui.com/download/" });
  expect(append).toHaveBeenCalledTimes(1);
  expect((append.mock.calls[0]![0] as HTMLScriptElement).src).toBe(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
  const calls = window.dataLayer!.map((a) => Array.from(a as IArguments));
  expect(calls).toContainEqual(["config", GA_ID, { content_group: "demo-erp" }]);
  expect(calls).toContainEqual(["event", "about_open", { trigger: "link" }]);
});
