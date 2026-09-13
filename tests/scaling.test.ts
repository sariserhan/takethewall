import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal, api } from "../convex/_generated/api";
import { flushAnalytics } from "./backend-work-helpers";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T23:59:58Z"));
  vi.stubEnv("PUBLIC_METRICS_ENABLED", "true");
  vi.stubEnv("WALL_ENVIRONMENT", "production");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules);
  const logo = await t.run((ctx) => ctx.storage.store(new Blob(["logo"])));
  const takeoverId = await t.mutation(internal.wall.seed, {
    logoStorageId: logo,
  });
  const event = (n: number) => ({
    takeoverId,
    visitorHash: `browser-${n}`,
    pageId: `page-${n}`,
    eventId: `event-${n}`,
    event: "impression" as const,
    region: "US",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 300_000,
    excluded: false,
  });
  return { t, event, takeoverId };
}
it("buffers a burst without changing ownership documents, then publishes deduplicated totals", async () => {
  const { t, event, takeoverId } = await setup();
  const initial = await t.run((ctx) => ctx.db.get(takeoverId));
  for (let n = 0; n < 128; n++) {
    await t.mutation(internal.analytics.record, event(n));
    await t.mutation(internal.analytics.record, event(n));
  }
  expect(await t.run((ctx) => ctx.db.get(takeoverId))).toEqual(initial);
  expect((await t.query(api.wall.current, {}))?.totalVisitors).toBe(0);
  const batches = await t.run((ctx) =>
    ctx.db.query("analyticsBatches").collect(),
  );
  expect(batches.length).toBeLessThanOrEqual(16);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.query(api.wall.current, {})).toMatchObject({
    totalVisitors: 128,
    owner: { id: takeoverId, impressions: 128, uniqueVisitors: 128 },
  });
  for (const b of batches)
    await t.mutation(internal.analytics.flush, { id: b._id });
  expect((await t.query(api.wall.current, {}))?.totalVisitors).toBe(128);
});
it("keeps day and lifetime uniqueness correct when a batch crosses midnight", async () => {
  const { t, event } = await setup();
  await t.mutation(internal.analytics.record, event(1));
  vi.setSystemTime(Date.now() + 5000);
  await t.mutation(internal.analytics.record, {
    ...event(1),
    pageId: "next-day",
  });
  await flushAnalytics(t);
  const days = await t.run((ctx) => ctx.db.query("dailyStats").collect());
  expect(
    days
      .filter((d) => d.visitors === 1)
      .map((d) => d.date)
      .sort(),
  ).toEqual(["2026-09-14", "2026-09-15"]);
  expect(await t.query(api.wall.current, {})).toMatchObject({
    visitorsToday: 1,
    totalVisitors: 1,
    utcDate: "2026-09-15",
    owner: { impressions: 2, uniqueVisitors: 1 },
  });
});
it("sends newly queued transactional mail without a cron and ignores duplicate execution", async () => {
  const { t } = await setup();
  const { mail } = await import("../convex/rewardModel");
  vi.stubEnv("RESEND_API_KEY", "test");
  vi.stubEnv("RESEND_FROM", "notification@takethewall.com");
  const send = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ id: "email-fixture" }), { status: 200 }),
    );
  vi.stubGlobal("fetch", send);
  try {
    await t.run((ctx) =>
      mail(ctx, {
        key: "scheduled-test",
        kind: "support",
        to: "recipient@example.com",
        subject: "A reply",
        body: "Hello",
      }),
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const message = (
      await t.run((ctx) => ctx.db.query("transactionalMail").collect())
    )[0];
    expect(message.state).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    await t.action(internal.delivery.deliver, {
      source: "mail",
      id: message._id,
    });
    expect(send).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("scheduling a future message does not hold up ready email", async () => {
  const { t } = await setup();
  const { mail } = await import("../convex/rewardModel");
  const { scheduleDelivery } = await import("../convex/deliverySchedule");
  await t.run(async (ctx) => {
    await mail(ctx, {
      key: "future",
      kind: "support",
      to: "recipient@example.com",
      subject: "Later",
      body: "Hello",
    });
    const message = await ctx.db.query("transactionalMail").first();
    await scheduleDelivery(ctx, "mail", message!._id, Date.now() + 86400_000);
    await mail(ctx, {
      key: "now",
      kind: "support",
      to: "recipient@example.com",
      subject: "Now",
      body: "Hello",
    });
  });
  const clock = await t.run((ctx) => ctx.db.query("deliveryClock").first());
  expect(clock!.nextAt - Date.now()).toBeLessThan(5000);
});
