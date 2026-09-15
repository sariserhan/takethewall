import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import presence from "@convex-dev/presence/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { flushAnalytics } from "./backend-work-helpers";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => { vi.stubEnv("PUBLIC_METRICS_ENABLED", "true"); vi.stubEnv("WALL_ENVIRONMENT", "production"); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-15T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest(schema, modules);
  const storageId = await t.run(ctx => ctx.storage.store(new Blob(["image"])));
  const takeoverId = await t.mutation(internal.wall.seed, { logoStorageId: storageId });
  const publicId = `ttw_${"a".repeat(32)}`;
  await t.run(ctx => ctx.db.patch(takeoverId, { publicTakeoverId: publicId }));
  const payload = { event: "visitor.arrival" as const, data: { sessionId: "session-one", visitorId: "provider-person", timestamp: new Date().toISOString(), siteName: "Wall", siteDomain: "takethewall.com", location: { city: "Tokyo", region: "Tokyo", country: "JP" }, source: "Visitorping Admin", entryPage: "https://takethewall.com/", deviceType: "tablet", isHotLead: false, companyName: "", referralPublicId: publicId } };
  const event = { takeoverId, visitorHash: "browser-one", pageId: "page-one", eventId: "event-one", event: "impression" as const, region: "JP", city: "Tokyo", issuedAt: Date.now(), expiresAt: Date.now() + 300_000, excluded: false };
  const callback = { ...event, source: "visitorping" as const, providerSessionId: "session-one", providerVisitorId: "provider-person", referral: { publicId, visitorHash: "f".repeat(64) } };
  return { t, payload, event, callback };
}
it("counts a Tokyo arrival, its region and tracked referral exactly once across retries and replays", async () => {
  const { t, payload } = await setup();
  await t.mutation(internal.visitorPingWebhook.receive, { payload });
  await t.mutation(internal.visitorPingWebhook.receive, { payload });
  const ids = await t.run(async ctx => (await ctx.db.query("visitorPingWebhookDeliveries").collect()).map(x => x._id));
  await t.mutation(internal.visitorPingWebhook.replay, { ids });
  expect(await t.query(api.wall.current, {})).toMatchObject({ viewsToday: 1, totalViews: 1, regions: [{ regionCode: "JP", impressions: 1 }], radarCities: { views: 1, cities: [{ city: "Tokyo", views: 1 }] }, owner: { shareVisitors: 1 } });
});
for (const order of ["arrival-first", "callback-first", "browser-first"] as const) it(`merges arrivals and browser callbacks with one referral (${order})`, async () => {
  const { t, payload, event, callback } = await setup();
  if (order === "arrival-first") await t.mutation(internal.visitorPingWebhook.receive, { payload });
  if (order === "browser-first") { await t.mutation(internal.analytics.record, event); await flushAnalytics(t); }
  await t.mutation(internal.analytics.record, callback);
  await flushAnalytics(t);
  await t.mutation(internal.visitorPingWebhook.receive, { payload });
  await t.mutation(internal.analytics.record, event);
  await t.mutation(internal.analytics.record, callback);
  await flushAnalytics(t);
  expect(await t.query(api.wall.current, {})).toMatchObject({ viewsToday: 1, totalViews: 1, visitorsToday: 1, regions: [{ regionCode: "JP", impressions: 1 }], radarCities: { views: 1, cities: [{ city: "Tokyo", views: 1 }] }, owner: { shareVisitors: 1 } });
  expect(await t.query(api.visitLedger.radar, { date: "2026-09-15" })).toHaveLength(1);
});
it("reconciles a late callback after both arrival and Vercel already counted, including different geography", async () => {
  const { t, payload, event, callback } = await setup();
  await t.mutation(internal.analytics.record, { ...event, region: "US", city: "New York" });
  await flushAnalytics(t);
  await t.mutation(internal.visitorPingWebhook.receive, { payload });
  expect((await t.query(api.wall.current, {}))?.viewsToday).toBe(2);
  await t.mutation(internal.analytics.record, callback);
  await flushAnalytics(t);
  expect(await t.query(api.wall.current, {})).toMatchObject({ viewsToday: 1, regions: [{ regionCode: "JP", impressions: 1 }], radarCities: { cities: [{ city: "Tokyo", views: 1 }] }, owner: { shareVisitors: 1 } });
});
it("removes provisional visits and referrals when a signed callback excludes the visit", async () => {
  const { t, payload, callback } = await setup();
  await t.mutation(internal.visitorPingWebhook.receive, { payload });
  await t.mutation(internal.analytics.record, { ...callback, excluded: true });
  await t.mutation(internal.visitorPingWebhook.receive, { payload });
  expect(await t.query(api.wall.current, {})).toMatchObject({ viewsToday: 0, totalViews: 0, regions: [], radarCities: { cities: [] }, owner: { shareVisitors: 0 } });
});
it("keeps separate sessions in the same city and ignores untracked source domains as referrals", async () => {
  const { t, payload } = await setup();
  const { referralPublicId: _, ...data } = payload.data;
  void _;
  await t.mutation(internal.visitorPingWebhook.receive, { payload: { ...payload, data } });
  await t.mutation(internal.visitorPingWebhook.receive, { payload: { ...payload, data: { ...data, sessionId: "session-two", source: "https://owner.example/" } } });
  expect(await t.query(api.wall.current, {})).toMatchObject({ viewsToday: 2, radarCities: { cities: [{ city: "Tokyo", views: 2 }] }, owner: { shareVisitors: 0 } });
});
it("deduplicates legacy admin payloads without inventing live browser presence", async () => {
  const { t, payload } = await setup();
  const { sessionId: _, visitorId: __, ...data } = payload.data;
  void _; void __;
  await t.mutation(internal.visitorPingWebhook.receive, { payload: { ...payload, data } });
  await t.mutation(internal.visitorPingWebhook.receive, { payload: { ...payload, data } });
  expect((await t.query(api.wall.current, {}))?.viewsToday).toBe(1);
});
it("does not add an unidentifiable legacy browser alert on top of native views", async () => {
  const { t, payload, event } = await setup();
  await t.mutation(internal.analytics.record, event);
  await flushAnalytics(t);
  const { sessionId: _, visitorId: __, ...data } = payload.data;
  void _; void __;
  await t.mutation(internal.visitorPingWebhook.receive, { payload: { ...payload, data: { ...data, source: "Direct" } } });
  expect((await t.query(api.wall.current, {}))?.viewsToday).toBe(1);
});
it("uses the provider visitor identity to avoid repeated referral credit across sessions", async () => {
  const { t, payload, callback } = await setup();
  await t.mutation(internal.visitorPingWebhook.receive, { payload });
  await t.mutation(internal.analytics.record, callback);
  await flushAnalytics(t);
  await t.mutation(internal.visitorPingWebhook.receive, { payload: { ...payload, data: { ...payload.data, sessionId: "session-two" } } });
  expect(await t.query(api.wall.current, {})).toMatchObject({ viewsToday: 2, owner: { shareVisitors: 1 } });
});

for (const order of ["arrival-first", "callback-first"] as const) it(`attaches visitor number to the live browser (${order}) without duplicate visits`, async () => {
  const { t, payload, callback } = await setup();
  presence.register(t);
  const heartbeat = { visitorHash: callback.visitorHash, pageId: callback.pageId, city: "Tokyo", country: "JP" };
  await t.mutation(internal.wallPresence.heartbeat, heartbeat);
  const numbered = { ...payload, data: { ...payload.data, visitorNumber: 231 } };
  if (order === "arrival-first") await t.mutation(internal.visitorPingWebhook.receive, { payload: numbered });
  await t.mutation(internal.analytics.record, callback);
  await t.mutation(internal.visitorPingWebhook.receive, { payload: numbered });
  await t.mutation(internal.analytics.record, callback);
  await t.mutation(internal.wallPresence.heartbeat, { ...heartbeat, pageId: "another-tab" });
  await flushAnalytics(t);
  const rows = await t.query(api.wallPresence.live, {});
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ visitorNumber: 231, city: "Tokyo", country: "JP" });
  expect(JSON.stringify(rows)).not.toContain(callback.visitorHash);
  expect((await t.query(api.wall.current, {}))?.viewsToday).toBe(1);
});
it("retains impression numbering before the first heartbeat and ignores excluded callbacks", async () => {
  const { t, callback } = await setup();
  presence.register(t);
  await t.mutation(internal.analytics.record, { ...callback, visitorNumber: 231 });
  await t.mutation(internal.wallPresence.heartbeat, { visitorHash: callback.visitorHash, pageId: callback.pageId, city: "Tokyo", country: "JP" });
  expect((await t.query(api.wallPresence.live, {}))[0]).toMatchObject({ visitorNumber: 231 });
  await t.mutation(internal.analytics.record, { ...callback, visitorNumber: 999, excluded: true });
  expect((await t.query(api.wallPresence.live, {}))[0]).toMatchObject({ visitorNumber: 231 });
});
