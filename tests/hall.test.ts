import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { syncHall } from "../convex/hallModel";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
  vi.stubEnv("ADMIN_USER_IDS", "admin");
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  vi.stubEnv("PUBLIC_METRICS_ENABLED", "true");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules),
    admin = t.withIdentity({ subject: "admin" });
  const publish = async (n: number) =>
    admin.mutation(api.admin.publish, {
      contentType: "personal",
      displayName: `Owner ${n}`,
      websiteUrl: "",
      description: "Hello",
      recipientEmail: `owner${n}@example.com`,
      countTowardMilestones: true,
      reason: "Test fixture",
      requestKey: String(n),
      expectedCurrentId:
        (await t.query(api.wall.current, {}))?.owner.id ?? null,
    });
  return { t, admin, publish };
}
it("requires admin access to enable the hall and hides public rankings immediately when disabled", async () => {
  const { t, admin, publish } = await setup();
  await publish(1);
  vi.setSystemTime(Date.now() + 60000);
  await publish(2);
  expect(await t.query(api.hall.leaders, {})).toBeNull();
  await expect(
    t.mutation(api.hall.setEnabled, { enabled: true }),
  ).rejects.toThrow("Administrator");
  await admin.mutation(api.hall.setEnabled, { enabled: true });
  await t.mutation(internal.hall.backfill, {});
  expect((await t.query(api.hall.leaders, {}))?.entries).toMatchObject([
    { category: "reign", name: "Owner 1", value: 60000 },
  ]);
  await admin.mutation(api.hall.setEnabled, { enabled: false });
  expect(await t.query(api.hall.leaders, {})).toBeNull();
});
it("uses verified referrals, excludes test placements and removes moderated leaders", async () => {
  const { t, admin, publish } = await setup();
  const one = await publish(1);
  const publicId = (await t.run((ctx) => ctx.db.get(one)))!.publicTakeoverId!;
  await t.mutation(internal.growth.visit, {
    publicId,
    visitorHash: "a".repeat(64),
  });
  await t.mutation(internal.growth.visit, {
    publicId,
    visitorHash: "a".repeat(64),
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(one, { clicks: 7 });
    await syncHall(ctx, one);
  });
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  const two = await publish(2);
  await t.run(async (ctx) => {
    await ctx.db.patch(two, { clicks: 999, shareVisitors: 999 });
    await syncHall(ctx, two);
  });
  await admin.mutation(api.hall.setEnabled, { enabled: true });
  await t.mutation(internal.hall.backfill, {});
  const before = (await t.query(api.hall.leaders, {}))!.entries;
  expect(before.find((e) => e.category === "referrals")).toMatchObject({
    name: "Owner 1",
    value: 1,
  });
  expect(before.find((e) => e.category === "clicks")).toMatchObject({
    name: "Owner 1",
    value: 7,
  });
  await admin.mutation(api.admin.moderate, {
    takeoverId: one,
    reason: "Unsafe content",
    confirmed: true,
  });
  expect((await t.query(api.hall.leaders, {}))!.entries).toEqual([]);
});
it("backfills historical scores idempotently without changing history visibility", async () => {
  const { t, admin, publish } = await setup();
  await publish(1);
  vi.setSystemTime(Date.now() + 1000);
  await publish(2);
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("hallEntries").collect())
      await ctx.db.delete(row._id);
  });
  await admin.mutation(api.growth.setHistoryVisibility, { enabled: false });
  await admin.mutation(api.hall.setEnabled, { enabled: true });
  await t.mutation(internal.hall.backfill, {});
  await t.mutation(internal.hall.backfill, {});
  expect(
    await t.run((ctx) => ctx.db.query("hallEntries").collect()),
  ).toHaveLength(2);
  expect(await t.query(api.growth.visibility, {})).toBe(false);
  expect((await t.query(api.hall.leaders, {}))?.entries[0].value).toBe(1000);
});
