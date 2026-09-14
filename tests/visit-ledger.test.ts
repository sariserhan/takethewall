import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { flushAnalytics } from "./backend-work-helpers";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => { vi.stubEnv("PUBLIC_METRICS_ENABLED", "true"); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-14T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest(schema, modules);
  const storageId = await t.run(ctx => ctx.storage.store(new Blob(["image"])));
  const takeoverId = await t.mutation(internal.wall.seed, { logoStorageId: storageId });
  const event = { takeoverId, visitorHash: "browser-one", pageId: "page-one", eventId: "event-one", event: "impression" as const, region: "US", city: "New York", issuedAt: Date.now(), expiresAt: Date.now() + 300_000, excluded: false };
  return { t, event };
}
for (const first of ["vercel", "visitorping"] as const) it(`merges both sources once when ${first} arrives first, enriching geography without changing totals`, async () => {
  const { t, event } = await setup();
  const vercel = { ...event, source: "vercel" as const };
  const visitorping = { ...event, source: "visitorping" as const, region: "AU", city: "Sydney" };
  await t.mutation(internal.analytics.record, first === "vercel" ? vercel : visitorping);
  await flushAnalytics(t);
  await t.mutation(internal.analytics.record, first === "vercel" ? visitorping : vercel);
  await t.mutation(internal.analytics.record, visitorping);
  await flushAnalytics(t);
  const wall = await t.query(api.wall.current, {});
  expect(wall).toMatchObject({ visitorsToday: 1, viewsToday: 1, totalVisitors: 1, regions: [{ regionCode: "AU", impressions: 1 }] });
  const radar = await t.query(api.visitLedger.radar, { date: "2026-09-14" });
  expect(radar).toHaveLength(1);
  expect(radar[0]).toMatchObject({ city: "Sydney", country: "AU" });
  expect(Object.keys(radar[0]).sort()).toEqual(["city", "country", "id", "receivedAt"]);
  expect(JSON.stringify(radar)).not.toContain("browser-one");
});
it("keeps different people in the same city separate, and repeated page views unique per browser", async () => {
  const { t, event } = await setup();
  await t.mutation(internal.analytics.record, event);
  await t.mutation(internal.analytics.record, { ...event, visitorHash: "browser-two", pageId: "page-two" });
  await t.mutation(internal.analytics.record, { ...event, pageId: "page-three" });
  await flushAnalytics(t);
  expect(await t.query(api.wall.current, {})).toMatchObject({ viewsToday: 3, visitorsToday: 2, totalVisitors: 2 });
  expect(await t.query(api.visitLedger.radar, { date: "2026-09-14" })).toHaveLength(2);
});
it("rejects a cross-browser page ID collision rather than combining identities", async () => {
  const { t, event } = await setup();
  await t.mutation(internal.analytics.record, event);
  await expect(t.mutation(internal.analytics.record, { ...event, visitorHash: "someone-else", source: "visitorping" })).rejects.toThrow("Visit identity mismatch");
});
it("uses the original UTC day for delayed verified callbacks and never replays an old visit as today", async () => {
  const { t, event } = await setup();
  vi.setSystemTime(new Date("2026-09-15T01:00:00Z"));
  await expect(t.mutation(internal.analytics.record, event)).rejects.toThrow("expired");
  await t.mutation(internal.analytics.record, { ...event, source: "visitorping" });
  await flushAnalytics(t);
  const day = await t.run(ctx => ctx.db.query("dailyStats").withIndex("by_date", q => q.eq("date", "2026-09-14")).unique());
  expect(day).toMatchObject({ visitors: 1, impressions: 1 });
  expect(await t.query(api.visitLedger.radar, { date: "2026-09-15" })).toEqual([]);
});
it("enriches before aggregation without double-counting and rejects excluded callbacks", async () => {
  const { t, event } = await setup();
  await t.mutation(internal.analytics.record, event);
  await t.mutation(internal.analytics.record, { ...event, source: "visitorping", region: "MX", city: "Mexico City" });
  await t.mutation(internal.analytics.record, { ...event, pageId: "excluded", excluded: true });
  await flushAnalytics(t);
  expect(await t.query(api.wall.current, {})).toMatchObject({ viewsToday: 1, regions: [{ regionCode: "MX", impressions: 1 }] });
});

it("backfills missing daily browsers once without inventing locations or changing totals", async () => {
  const { t, event } = await setup();
  await t.mutation(internal.analytics.record, event);
  await flushAnalytics(t);
  await t.run(async ctx => {
    await ctx.db.insert("dailyVisitors", { date: "2026-09-14", visitorHash: "historical-browser", expiresAt: Date.now() + 86400_000 });
    await ctx.db.insert("dailyVisitors", { date: "2026-09-13", visitorHash: "previous-day", expiresAt: Date.now() + 86400_000 });
  });
  const before = await t.query(api.wall.current, {});
  const args = { date: "2026-09-14" };
  expect(await t.mutation(internal.visitLedger.backfillRadar, { ...args, dryRun: true })).toMatchObject({ inserted: 1, existing: 1, done: true });
  expect(await t.query(api.visitLedger.radar, args)).toHaveLength(1);
  expect(await t.mutation(internal.visitLedger.backfillRadar, args)).toMatchObject({ inserted: 1, existing: 1 });
  expect(await t.mutation(internal.visitLedger.backfillRadar, args)).toMatchObject({ inserted: 0, existing: 2 });
  const rows = await t.query(api.visitLedger.radar, args);
  expect(rows).toHaveLength(2);
  expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ city: "New York", country: "US" }), expect.objectContaining({ city: "", country: "ZZ" })]));
  expect(await t.query(api.wall.current, {})).toEqual(before);
  const oldId = rows.find(row => row.country === "ZZ")!.id;
  vi.setSystemTime(Date.now() + 60000);
  await t.mutation(internal.analytics.record, { ...event, visitorHash: "historical-browser", pageId: "returning-page", eventId: "returning-event", issuedAt: Date.now(), expiresAt: Date.now() + 300000, city: "Sydney", region: "AU" });
  const enriched = await t.query(api.visitLedger.radar, args);
  expect(enriched).toHaveLength(2);
  expect(enriched.find(row => row.id === oldId)).toMatchObject({ city: "Sydney", country: "AU" });
});

it.each([true, false])("keeps city visits equal to the daily counter when geography arrives before flush: %s", async beforeFlush => {
  const { t, event } = await setup();
  vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
  const view = { ...event, issuedAt: Date.now(), expiresAt: Date.now() + 300000 };
  const check = async (total: number) => {
    const wall = (await t.query(api.wall.current, {}))!;
    expect(wall.viewsToday).toBe(total);
    expect(wall.radarCities!.views).toBe(total);
    expect(wall.radarCities!.cities.reduce((sum, city) => sum + city.views, 0)).toBe(total);
    return wall.radarCities!;
  };
  await t.mutation(internal.analytics.record, view);
  await check(0); // Pending events do not get ahead of the daily counter.
  if (!beforeFlush) await flushAnalytics(t);
  await t.mutation(internal.analytics.record, { ...view, source: "visitorping", city: "Sydney", region: "AU" });
  await flushAnalytics(t);
  expect((await check(1)).cities).toEqual([{ city: "Sydney", country: "AU", label: "Sydney, AU", views: 1 }]);
  await t.mutation(internal.analytics.record, { ...view, source: "visitorping", city: "Sydney", region: "AU" });
  await check(1);
  await t.mutation(internal.analytics.record, { ...view, city: "Sydney", region: "AU", pageId: "repeat-page" });
  await flushAnalytics(t);
  expect((await check(2)).cities[0].views).toBe(2);
  expect((await t.query(api.wall.current, {}))!.visitorsToday).toBe(1);
});
it("uses the historical snapshot once and includes every unmatched visit in the remainder", async () => {
  const { t, event } = await setup();
  await t.mutation(internal.analytics.record, event);
  await flushAnalytics(t);
  await t.run(async ctx => {
    const daily = await ctx.db.query("dailyStats").withIndex("by_date", q => q.eq("date", "2026-09-14")).unique();
    await ctx.db.patch(daily!._id, { impressions: 49 });
  });
  let wall = (await t.query(api.wall.current, {}))!;
  expect(wall.radarCities!.cities.reduce((sum, city) => sum + city.views, 0)).toBe(49);
  expect(wall.radarCities!.cities.find(city => city.country === "ZZ")).toMatchObject({ views: 1 });
  vi.setSystemTime(new Date("2026-09-14T22:00:00Z"));
  await t.mutation(internal.analytics.record, { ...event, pageId: "later-page", city: "Ft. Washington", issuedAt: Date.now(), expiresAt: Date.now() + 300000 });
  await flushAnalytics(t);
  wall = (await t.query(api.wall.current, {}))!;
  expect(wall.viewsToday).toBe(50);
  expect(wall.radarCities!.cities.reduce((sum, city) => sum + city.views, 0)).toBe(50);
  expect(wall.radarCities!.cities.find(city => city.city === "Fort Washington")).toMatchObject({ views: 35 });
  expect(wall.radarCities!.cities.find(city => city.country === "ZZ")).toMatchObject({ views: 1 });
});
