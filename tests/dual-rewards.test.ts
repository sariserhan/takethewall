import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { DEFAULT_RULES } from "../lib/reward-rules";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.ts");
const make = () => convexTest(schema, modules);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  vi.stubEnv("ADMIN_USER_IDS", "admin");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = make();
  const admin = t.withIdentity({ subject: "admin" });
  await t.run((ctx) =>
    ctx.db.insert("rewardSettings", {
      key: "current",
      value: {
        dualRewardsEnabled: true,
        milestones: [{ takeoverNumber: 4, rewardUsd: 100 }],
        initialDays: 7,
        additionalDays: 7,
        rulesVersion: "dual-test",
        rulesJson: JSON.stringify(DEFAULT_RULES),
        rewardsEnabled: true,
        payoutsEnabled: false,
        promotionEnabled: true,
      },
    }),
  );
  const publish = async (n: number, extra = {}) => {
    const wall = await t.query(api.wall.current, {});
    return admin.mutation(api.admin.publish, {
      contentType: "personal",
      websiteUrl: "",
      displayName: `Owner ${n}`,
      description: "Hello",
      countTowardMilestones: true,
      recipientEmail: `owner${n}@example.com`,
      reason: "Test entry",
      requestKey: `entry-${n}`,
      expectedCurrentId: wall?.owner.id ?? null,
      ...extra,
    });
  };
  return { t, admin, publish };
}
async function rank(t: ReturnType<typeof make>) {
  const b = (
    await t.run((ctx) => ctx.db.query("milestoneRewards").collect())
  ).find((r) => r.kind === "performance_traffic")!;
  for (let i = 0; i < 20; i++) {
    await t.mutation(internal.performanceRewards.select, { rewardId: b._id });
    const work = await t.run((ctx) =>
      ctx.db.query("performanceSelections").first(),
    );
    if (work?.phase === "done")
      return (await t.run((ctx) => ctx.db.get(b._id)))!;
  }
  throw new Error("Selection failed to finish");
}
async function visits(
  t: ReturnType<typeof make>,
  takeoverId: Id<"takeovers">,
  referrals: number,
  uniques = 0,
) {
  await t.run(async (ctx) => {
    for (let i = 0; i < referrals; i++)
      await ctx.db.insert("referralVisits", {
        takeoverId,
        visitorHash: `r-${i}`,
        createdAt: Date.now(),
      });
    for (let i = 0; i < uniques; i++)
      await ctx.db.insert("takeoverVisitors", {
        takeoverId,
        visitorHash: `u-${i}`,
        firstSeenAt: Date.now(),
      });
  });
}
it("creates independent rewards, freezes traffic and uses unique visitors as the tiebreak", async () => {
  const { t, publish, admin } = await setup();
  const one = await publish(1);
  await visits(t, one, 2, 1);
  const two = await publish(2);
  await visits(t, two, 2, 3);
  const three = await publish(3);
  await t.run((ctx) =>
    ctx.db.patch(three, { shareVisitors: 99999, uniqueVisitors: 99999 }),
  );
  vi.setSystemTime(Date.now() + 1000);
  await publish(4);
  vi.setSystemTime(Date.now() + 1000);
  await visits(t, three, 10, 20);
  let b = await rank(t);
  expect(b).toMatchObject({
    candidateNumber: 2,
    verifiedReferrals: 2,
    status: "pending_claim",
  });
  const rows = await t.run((ctx) => ctx.db.query("rewardClaims").collect());
  expect(rows.map((c) => c.takeoverNumber).sort()).toEqual([2, 4]);
  const publicData = await t.query(api.rewards.overview, { number: 4 });
  expect(publicData.milestones).toHaveLength(1);
  expect(publicData.milestones[0].performance).toMatchObject({
    candidateNumber: 2,
    cohortFrom: 1,
    cohortTo: 3,
  });
  await admin.mutation(api.admin.claimAction, {
    claimId: b.claimId!,
    action: "ineligible",
    expectedStatus: "pending_claim",
    body: "Verification failed",
    confirmed: true,
  });
  b = (await t.run((ctx) => ctx.db.get(b._id)))!;
  expect(b.candidateNumber).toBe(1);
  await admin.mutation(api.admin.claimAction, {
    claimId: b.claimId!,
    action: "ineligible",
    expectedStatus: "pending_claim",
    body: "Verification failed",
    confirmed: true,
  });
  expect((await t.run((ctx) => ctx.db.get(b._id)))?.status).toBe("unawarded");
  const a = (
    await t.run((ctx) => ctx.db.query("milestoneRewards").collect())
  ).find((r) => r.kind !== "performance_traffic")!;
  expect(a.status).toBe("pending_claim");
});
it("leaves a cohort with zero verified referrals unawarded", async () => {
  const { t, publish } = await setup();
  for (let i = 1; i <= 4; i++) await publish(i);
  expect(await rank(t)).toMatchObject({ status: "unawarded" });
  expect(
    await t.run((ctx) => ctx.db.query("rewardClaims").collect()),
  ).toHaveLength(1);
});
it("processes free email entries once, protects admin access and keeps private references private", async () => {
  const { t, publish } = await setup();
  const entry = {
    freeEntryReference: "<unique-message@example.com>",
    freeEntryReceivedAt: Date.now() - 1000,
  };
  const id = await publish(1, entry);
  expect(await publish(1, entry)).toBe(id);
  expect((await t.query(api.wall.current, {}))?.totalTakeovers).toBe(1);
  expect(JSON.stringify(await t.query(api.wall.current, {}))).not.toContain(
    entry.freeEntryReference,
  );
  const purchase = await t.run((ctx) => ctx.db.query("purchases").first());
  expect(purchase).toMatchObject({
    amountCents: 0,
    freeEntryReference: entry.freeEntryReference,
  });
  await expect(
    t.mutation(api.admin.publish, {
      contentType: "personal",
      websiteUrl: "",
      displayName: "Intruder",
      description: "Hi",
      countTowardMilestones: true,
      recipientEmail: "intruder@example.com",
      reason: "No",
      requestKey: "no",
      expectedCurrentId: id,
      ...entry,
    }),
  ).rejects.toThrow("Administrator");
});

it("skips a blocked traffic leader and resumes bounded referral pages without double counting", async () => {
  const { t, publish } = await setup();
  const one = await publish(1);
  await visits(t, one, 205);
  await t.run((ctx) => ctx.db.patch(one, { blocked: true }));
  const two = await publish(2);
  await visits(t, two, 1);
  await publish(3);
  await publish(4);
  let b = await rank(t);
  expect(b.status).toBe("awaiting_successor");
  await t.mutation(internal.rewards.maintain, {});
  b = (await t.run((ctx) => ctx.db.get(b._id)))!;
  expect(b).toMatchObject({
    candidateNumber: 2,
    status: "pending_claim",
    verifiedReferrals: 1,
  });
  await t.mutation(internal.performanceRewards.select, { rewardId: b._id });
  const ranks = await t.run((ctx) =>
    ctx.db.query("performanceRanks").collect(),
  );
  expect(ranks.find((r) => r.takeoverId === one)?.referrals).toBe(205);
  expect(
    await t.run((ctx) => ctx.db.query("rewardClaims").collect()),
  ).toHaveLength(3);
});
