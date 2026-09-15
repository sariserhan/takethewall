import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { flushAnalytics } from "./backend-work-helpers";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => { vi.stubEnv("PUBLIC_METRICS_ENABLED", "true"); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-15T23:59:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest(schema, modules);
  const image = await t.run(ctx => ctx.storage.store(new Blob(["image"])));
  const takeoverId = await t.mutation(internal.wall.seed, { logoStorageId: image });
  const view = (pageId: string, city = "Tokyo") => ({ takeoverId, visitorHash: "person", pageId, eventId: pageId, event: "impression" as const, region: "JP", city, issuedAt: Date.now(), expiresAt: Date.now() + 300_000, excluded: false });
  return { t, takeoverId, view };
}
it("keeps city counts across midnight and ledger cleanup, and resets only with a new takeover", async () => {
  const { t, takeoverId, view } = await setup();
  await t.mutation(internal.analytics.record, view("one")); await flushAnalytics(t);
  vi.setSystemTime(new Date("2026-09-16T00:01:00Z"));
  await t.mutation(internal.analytics.record, view("two")); await flushAnalytics(t);
  expect(await t.query(api.wall.current, {})).toMatchObject({ viewsToday: 1, takeoverRadarCities: { views: 2, cities: [{ city: "Tokyo", views: 2 }] } });
  vi.setSystemTime(new Date("2026-09-24T00:01:00Z"));
  await t.mutation(internal.visitLedger.cleanup, {});
  expect((await t.query(api.wall.current, {}))?.takeoverRadarCities).toMatchObject({ views: 2, cities: [{ city: "Tokyo", views: 2 }] });
  await t.run(async ctx => {
    const prior = (await ctx.db.get(takeoverId))!;
    const { _id, _creationTime, ...values } = prior; void _id; void _creationTime;
    const next = await ctx.db.insert("takeovers", { ...values, impressions: 0, uniqueVisitors: 0, activatedAt: Date.now() });
    const site = (await ctx.db.query("siteStats").withIndex("by_key", q => q.eq("key", "wall")).unique())!;
    await ctx.db.patch(site._id, { currentTakeoverId: next });
  });
  expect((await t.query(api.wall.current, {}))?.takeoverRadarCities).toMatchObject({ views: 0, cities: [] });
});
it("merges provider corrections and sorts cities by latest visit rather than count", async () => {
  const { t, view } = await setup();
  await t.mutation(internal.analytics.record, view("one"));
  await t.mutation(internal.analytics.record, view("two")); await flushAnalytics(t);
  vi.advanceTimersByTime(1000);
  const latest = view("three", "Kyoto");
  await t.mutation(internal.analytics.record, latest); await flushAnalytics(t);
  await t.mutation(internal.analytics.record, { ...latest, source: "visitorping", city: "Osaka" });
  const report = (await t.query(api.wall.current, {}))?.takeoverRadarCities;
  expect(report).toMatchObject({ views: 3, cities: [{ city: "Osaka", views: 1 }, { city: "Tokyo", views: 2 }] });
});
it("imports historical cities once without double counting retained ledger records", async () => {
  const { t, takeoverId, view } = await setup();
  await t.mutation(internal.analytics.record, view("old", "Kyoto")); await flushAnalytics(t);
  const through = Date.now(); vi.advanceTimersByTime(1000);
  await t.mutation(internal.analytics.record, view("new", "Osaka")); await flushAnalytics(t);
  const args = { takeoverId, through, cities: [{ city: "Tokyo", country: "JP", views: 1 }] };
  await t.mutation(internal.takeoverCities.importSnapshot, args);
  await t.mutation(internal.takeoverCities.importSnapshot, args);
  await t.mutation(internal.takeoverCities.backfill, { takeoverId, cursor: null });
  expect((await t.query(api.wall.current, {}))?.takeoverRadarCities).toMatchObject({ views: 2, cities: [{ city: "Osaka", views: 1 }, { city: "Tokyo", views: 1 }] });
});
it("includes missing historical locations so city rows always sum to the takeover counter", async () => {
  const { t, takeoverId } = await setup();
  await t.run(ctx => ctx.db.patch(takeoverId, { impressions: 9 }));
  const report = (await t.query(api.wall.current, {}))?.takeoverRadarCities;
  expect(report).toMatchObject({ views: 9, cities: [{ city: "", label: "Location not recorded", views: 9 }] });
});
