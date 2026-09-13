import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createCandidate } from "./rewardModel";

// Durable bounded passes read immutable event timestamps, never demo counters.
// A retry resumes the transactionally persisted cursor, not the previous page.
export const select = internalMutation({
  args: { rewardId: v.id("milestoneRewards") },
  returns: v.null(),
  handler: async (ctx, { rewardId }) => {
    const work = await ctx.db
      .query("performanceSelections")
      .withIndex("by_reward", (q) => q.eq("rewardId", rewardId))
      .unique();
    if (!work || work.phase === "done") return null;
    const reward = await ctx.db.get(rewardId);
    if (!reward) return null;
    if (work.phase === "referrals") {
      const page = await ctx.db
        .query("referralVisits")
        .withIndex("by_created", (q) => q.lte("createdAt", work.cutoff))
        .paginate({ cursor: work.cursor, numItems: 200 });
      for (const visit of page.page) {
        if (visit._creationTime > reward._creationTime) continue;
        const t = await ctx.db.get(visit.takeoverId);
        const number = (t?.takeoverNumber ?? -Infinity) + work.offset;
        if (
          !t ||
          number < work.fromNumber ||
          number > work.toNumber ||
          !t.activatedAt ||
          t.activatedAt > work.cutoff
        )
          continue;
        const rank = await ctx.db
          .query("performanceRanks")
          .withIndex("by_reward_takeover", (q) =>
            q.eq("rewardId", rewardId).eq("takeoverId", t._id),
          )
          .unique();
        if (rank)
          await ctx.db.patch(rank._id, { referrals: rank.referrals + 1 });
        else
          await ctx.db.insert("performanceRanks", {
            rewardId,
            takeoverId: t._id,
            number,
            referrals: 1,
            uniqueVisitors: 0,
            reverseNumber: -number,
            attempted: false,
            scored: false,
          });
      }
      await ctx.db.patch(work._id, {
        cursor: page.isDone ? null : page.continueCursor,
        phase: page.isDone ? "visitors" : "referrals",
      });
    } else {
      const rank = work.rankId
        ? await ctx.db.get(work.rankId)
        : await ctx.db
            .query("performanceRanks")
            .withIndex("by_reward_scored", (q) =>
              q.eq("rewardId", rewardId).eq("scored", false),
            )
            .first();
      if (!rank) {
        await ctx.db.patch(work._id, { phase: "done", cursor: null });
        await createCandidate(ctx, rewardId, work.fromNumber);
        return null;
      }
      const page = await ctx.db
        .query("takeoverVisitors")
        .withIndex("by_takeover_firstSeen", (q) =>
          q.eq("takeoverId", rank.takeoverId).lte("firstSeenAt", work.cutoff),
        )
        .paginate({ cursor: work.cursor, numItems: 200 });
      await ctx.db.patch(rank._id, {
        uniqueVisitors:
          rank.uniqueVisitors +
          page.page.filter(
            (visit) => visit._creationTime <= reward._creationTime,
          ).length,
        scored: page.isDone,
      });
      await ctx.db.patch(work._id, {
        rankId: page.isDone ? undefined : rank._id,
        cursor: page.isDone ? null : page.continueCursor,
      });
    }
    await ctx.scheduler.runAfter(0, internal.performanceRewards.select, {
      rewardId,
    });
    return null;
  },
});
