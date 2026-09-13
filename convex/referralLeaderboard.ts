import { query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  leaderboardConfig,
  referralEligible,
  syncReferralRank,
} from "./referralLeaderboardModel";
const entry = v.object({
  number: v.number(),
  name: v.string(),
  publicId: v.string(),
  referrals: v.number(),
  uniqueVisitors: v.number(),
});
export const board = query({
  args: { number: v.number() },
  returns: v.object({
    state: v.union(
      v.literal("unavailable"),
      v.literal("updating"),
      v.literal("live"),
      v.literal("selecting"),
      v.literal("closed"),
    ),
    entries: v.array(entry),
  }),
  handler: async (ctx, { number }) => {
    const { config, generation, milestones } = await leaderboardConfig(ctx);
    const rewards = await ctx.db
      .query("milestoneRewards")
      .withIndex("by_number", (q) => q.eq("milestoneNumber", number))
      .take(10);
    const reward = rewards.find((r) => r.kind === "performance_traffic");
    if (reward) {
      if (reward.status === "selecting")
        return { state: "selecting" as const, entries: [] };
      const rows = await ctx.db
        .query("performanceRanks")
        .withIndex("by_public_rank", (q) => q.eq("rewardId", reward._id))
        .order("desc")
        .take(10);
      const entries = [];
      for (const row of rows) {
        const t = await ctx.db.get(row.takeoverId);
        if (t && row.referrals > 0 && (await referralEligible(ctx, t)))
          entries.push({
            number: row.number,
            name: t.displayName || t.domain,
            publicId: t.publicTakeoverId!,
            referrals: row.referrals,
            uniqueVisitors: row.uniqueVisitors,
          });
      }
      return { state: "closed" as const, entries };
    }
    if (
      rewards.length ||
      !config.promotionEnabled ||
      !config.dualRewardsEnabled ||
      !milestones.some((m) => m.takeoverNumber === number)
    )
      return { state: "unavailable" as const, entries: [] };
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    if ((site?.totalTakeovers ?? 0) + (site?.numberingOffset ?? 0) >= number)
      return { state: "unavailable" as const, entries: [] };
    const build = await ctx.db
      .query("liveReferralBuilds")
      .withIndex("by_generation", (q) => q.eq("generation", generation))
      .unique();
    if (!build?.ready) return { state: "updating" as const, entries: [] };
    const rows = await ctx.db
      .query("liveReferralRanks")
      .withIndex("by_rank", (q) =>
        q.eq("generation", generation).eq("milestone", number),
      )
      .order("desc")
      .take(10);
    const entries = [];
    for (const row of rows) {
      const t = await ctx.db.get(row.takeoverId);
      if (t && (await referralEligible(ctx, t)))
        entries.push({
          number: row.number,
          name: t.displayName || t.domain,
          publicId: t.publicTakeoverId!,
          referrals: row.referrals,
          uniqueVisitors: row.uniqueVisitors,
        });
    }
    return { state: "live" as const, entries };
  },
});
// Bounded, resumable initialization also handles changed cohort rules/offsets.
export const rebuild = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { generation } = await leaderboardConfig(ctx);
    const build = await ctx.db
      .query("liveReferralBuilds")
      .withIndex("by_generation", (q) => q.eq("generation", generation))
      .unique();
    if (build?.ready) return null;
    const page = await ctx.db
      .query("takeovers")
      .withIndex("by_takeoverNumber")
      .paginate({ cursor: build?.cursor ?? null, numItems: 100 });
    for (const t of page.page) await syncReferralRank(ctx, t._id);
    const value = {
      generation,
      ready: page.isDone,
      cursor: page.isDone ? null : page.continueCursor,
    };
    if (build) await ctx.db.patch(build._id, value);
    else await ctx.db.insert("liveReferralBuilds", value);
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.referralLeaderboard.rebuild, {});
    return null;
  },
});
