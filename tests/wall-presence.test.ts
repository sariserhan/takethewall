import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import presence from "@convex-dev/presence/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.useRealTimers());
function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  presence.register(t);
  return t;
}
const visitor = { visitorHash: "private-browser-identity", pageId: "tab-one", city: "Sydney", country: "AU" };
it("shows online browsers once across tabs, removes the last tab, and never counts heartbeats as views", async () => {
  const t = setup();
  const first = await t.mutation(internal.wallPresence.heartbeat, visitor);
  const second = await t.mutation(internal.wallPresence.heartbeat, { ...visitor, pageId: "tab-two" });
  await t.mutation(internal.wallPresence.heartbeat, visitor);
  const rows = await t.query(api.wallPresence.live, {});
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ city: "Sydney", country: "AU" });
  expect(JSON.stringify(rows)).not.toContain(visitor.visitorHash);
  await t.mutation(internal.wallPresence.disconnect, first);
  expect(await t.query(api.wallPresence.live, {})).toHaveLength(1);
  await t.mutation(internal.wallPresence.disconnect, second);
  expect(await t.query(api.wallPresence.live, {})).toEqual([]);
  await t.run(async ctx => {
    expect(await ctx.db.query("dailyStats").collect()).toEqual([]);
    expect(await ctx.db.query("visitLedger").collect()).toEqual([]);
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("expires interrupted sessions and allows returning visitors to rejoin", async () => {
  const t = setup();
  await t.mutation(internal.wallPresence.heartbeat, visitor);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.query(api.wallPresence.live, {})).toEqual([]);
  const returning = await t.mutation(internal.wallPresence.heartbeat, { ...visitor, pageId: "new-session" });
  expect(await t.query(api.wallPresence.live, {})).toHaveLength(1);
  await t.mutation(internal.wallPresence.disconnect, returning);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("a late disconnect from an old visibility session cannot remove the new session", async () => {
  const t = setup();
  const old = await t.mutation(internal.wallPresence.heartbeat, visitor);
  const current = await t.mutation(internal.wallPresence.heartbeat, { ...visitor, pageId: "tab-one:new-visibility" });
  await t.mutation(internal.wallPresence.disconnect, old);
  expect(await t.query(api.wallPresence.live, {})).toHaveLength(1);
  await t.mutation(internal.wallPresence.disconnect, current);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});
