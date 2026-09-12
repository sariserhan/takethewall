// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const data = {
  takeoverId: "paid-takeover",
  ownerDomain: "example.com",
  destination: "https://example.com/",
};
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal("window", { location: { pathname: "/" } });
  const values = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("waits for the asynchronous browser tracker without manufacturing a visitor or session", async () => {
  const { trackVisitorPing } = await import("../lib/visitorping-client");
  trackVisitorPing("wall_impression", data, { once: true });
  trackVisitorPing("wall_impression", data, { once: true });
  await vi.advanceTimersByTimeAsync(500);
  const track = vi.fn();
  window.VisitorPing = { track };
  await vi.advanceTimersByTimeAsync(250);
  expect(track).toHaveBeenCalledExactlyOnceWith("wall_impression", data);
  expect(vi.getTimerCount()).toBe(0);
});
it("drops blocked tracker queues after 15 seconds and never throws for a broken SDK", async () => {
  const { trackVisitorPing } = await import("../lib/visitorping-client");
  expect(() => trackVisitorPing("take_wall_clicked", data)).not.toThrow();
  await vi.advanceTimersByTimeAsync(15000);
  expect(vi.getTimerCount()).toBe(0);
  window.VisitorPing = {
    track: () => {
      throw Error("blocked");
    },
  };
  expect(() => trackVisitorPing("wall_owner_link_click", data)).not.toThrow();
});
it("never flushes analytics onto a private route", async () => {
  const { trackVisitorPing } = await import("../lib/visitorping-client");
  trackVisitorPing("wall_impression", data);
  const track = vi.fn();
  window.location.pathname = "/owner";
  window.VisitorPing = { track };
  await vi.advanceTimersByTimeAsync(250);
  trackVisitorPing("take_wall_clicked", data);
  expect(track).not.toHaveBeenCalled();
});
it("reports verified activation once across polling, rerenders and a page reload", async () => {
  const track = vi.fn();
  window.VisitorPing = { track };
  let mod = await import("../lib/visitorping-client");
  mod.trackVerifiedTakeover(null);
  mod.trackVerifiedTakeover(data);
  mod.trackVerifiedTakeover(data);
  vi.resetModules();
  mod = await import("../lib/visitorping-client");
  mod.trackVerifiedTakeover(data);
  expect(track.mock.calls.map((c) => c[0])).toEqual([
    "checkout_completed",
    "takeover_activated",
  ]);
});
