import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { syncHall } from "../convex/hallModel";
import { DEFAULT_RULES } from "../lib/reward-rules";
import type { Id } from "../convex/_generated/dataModel";
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
  await t.run((ctx) =>
    ctx.db.insert("rewardSettings", {
      key: "current",
      value: {
        dualRewardsEnabled: true,
        milestones: [
          { takeoverNumber: 4, rewardUsd: 100 },
          { takeoverNumber: 8, rewardUsd: 1000 },
        ],
        initialDays: 7,
        additionalDays: 7,
        rulesVersion: "leaderboard-test",
        rulesJson: JSON.stringify(DEFAULT_RULES),
        rewardsEnabled: true,
        payoutsEnabled: false,
        promotionEnabled: true,
      },
    }),
  );
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
  const visit = async (id: Id<"takeovers">, c: string) => {
    const row = (await t.run((ctx) => ctx.db.get(id)))!;
    return t.mutation(internal.growth.visit, {
      publicId: row.publicTakeoverId!,
      visitorHash: c.repeat(64),
    });
  };
  return { t, publish, visit };
}
it("updates leaders, deduplicates referrals, breaks ties, excludes tests and moderated entries", async () => {
  const { t, publish, visit } = await setup();
  const one = await publish(1),
    two = await publish(2);
  expect(
    (await t.query(api.referralLeaderboard.board, { number: 4 })).state,
  ).toBe("updating");
  await t.mutation(internal.referralLeaderboard.rebuild, {});
  expect(
    (await t.query(api.referralLeaderboard.board, { number: 4 })).entries,
  ).toEqual([]);
  await visit(one, "a");
  await visit(one, "a");
  await visit(two, "b");
  let board = await t.query(api.referralLeaderboard.board, { number: 4 });
  expect(board.entries.map((r) => [r.number, r.referrals])).toEqual([
    [1, 1],
    [2, 1],
  ]);
  await t.run(async (ctx) => {
    await ctx.db.patch(two, { uniqueVisitors: 10 });
    await syncHall(ctx, two);
  });
  expect(
    (await t.query(api.referralLeaderboard.board, { number: 4 })).entries[0]
      .number,
  ).toBe(2);
  await visit(one, "c");
  expect(
    (await t.query(api.referralLeaderboard.board, { number: 4 })).entries[0]
      .number,
  ).toBe(1);
  await t.run(async (ctx) => {
    await ctx.db.patch(one, { blocked: true });
    await syncHall(ctx, one);
  });
  expect(
    (await t.query(api.referralLeaderboard.board, { number: 4 })).entries.map(
      (r) => r.number,
    ),
  ).toEqual([2]);
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  const three = await publish(3);
  await t.run(async (ctx) => {
    await ctx.db.patch(three, { shareVisitors: 999 });
    await syncHall(ctx, three);
  });
  board = await t.query(api.referralLeaderboard.board, { number: 4 });
  expect(board.entries.map((r) => r.number)).toEqual([2]);
  expect(JSON.stringify(board)).not.toContain("@example.com");
  expect(JSON.stringify(board)).not.toContain("visitorHash");
});
it("closes at the boundary, freezes scores and gives the milestone entrant the next cohort", async () => {
  const { t, publish, visit } = await setup();
  const one = await publish(1);
  await publish(2);
  await publish(3);
  await t.mutation(internal.referralLeaderboard.rebuild, {});
  await visit(one, "a");
  vi.setSystemTime(Date.now() + 1000);
  const four = await publish(4);
  expect(
    (await t.query(api.referralLeaderboard.board, { number: 4 })).state,
  ).toBe("selecting");
  const reward = await t.run(async (ctx) =>
    (
      await ctx.db
        .query("milestoneRewards")
        .withIndex("by_number", (q) => q.eq("milestoneNumber", 4))
        .collect()
    ).find((r) => r.kind === "performance_traffic")!,
  );
  for (let i = 0; i < 8; i++)
    await t.mutation(internal.performanceRewards.select, {
      rewardId: reward._id,
    });
  const closed = await t.query(api.referralLeaderboard.board, { number: 4 });
  expect(closed.state).toBe("closed");
  expect(closed.entries[0].referrals).toBe(1);
  vi.setSystemTime(Date.now() + 1000);
  await visit(one, "b");
  await visit(four, "c");
  expect(await t.query(api.referralLeaderboard.board, { number: 4 })).toEqual(
    closed,
  );
  expect(
    (await t.query(api.referralLeaderboard.board, { number: 8 })).entries.map(
      (r) => [r.number, r.referrals],
    ),
  ).toEqual([[4, 1]]);
});
