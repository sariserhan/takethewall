import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { settings } from "./rewardModel";
import { numberingOffset } from "./numbering";
import { canonical, sha } from "../lib/audit";
export async function leaderboardConfig(ctx: QueryCtx) {
  const config = await settings(ctx),
    offset = await numberingOffset(ctx);
  const milestones = [...config.milestones].sort(
    (a, b) => a.takeoverNumber - b.takeoverNumber,
  );
  return {
    config,
    offset,
    milestones,
    generation: sha(
      canonical({
        milestones,
        offset,
        dual: config.dualRewardsEnabled ?? false,
      }),
    ),
  };
}
export async function referralEligible(ctx: QueryCtx, t: Doc<"takeovers">) {
  if (
    !t.publicTakeoverId ||
    t.takeoverNumber === undefined ||
    t.activatedAt === undefined ||
    t.blocked ||
    !["active", "replaced"].includes(t.status) ||
    !["paid", "admin_counted"].includes(t.kind)
  )
    return false;
  const p = await ctx.db
    .query("purchases")
    .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
    .unique();
  return (
    !!p &&
    !!p.buyerEmail &&
    !p.paymentIssue &&
    p.environment === "production" &&
    (t.kind === "admin_counted" || p.paidAt !== undefined)
  );
}
export async function syncReferralRank(ctx: MutationCtx, id: Id<"takeovers">) {
  const t = await ctx.db.get(id);
  const old = await ctx.db
    .query("liveReferralRanks")
    .withIndex("by_takeover", (q) => q.eq("takeoverId", id))
    .unique();
  if (
    !t ||
    !(t.shareVisitors && t.shareVisitors > 0) ||
    !(await referralEligible(ctx, t))
  ) {
    if (old) await ctx.db.delete(old._id);
    return;
  }
  const { config, offset, milestones, generation } =
    await leaderboardConfig(ctx);
  const number = t.takeoverNumber! + offset;
  const milestone = milestones.find(
    (m) => m.takeoverNumber > number,
  )?.takeoverNumber;
  if (!config.dualRewardsEnabled || !milestone) {
    if (old) await ctx.db.delete(old._id);
    return;
  }
  const value = {
    takeoverId: id,
    generation,
    milestone,
    number,
    referrals: t.shareVisitors,
    uniqueVisitors: t.uniqueVisitors,
    reverseNumber: -number,
  };
  if (old) {
    if (
      Object.entries(value).some(
        ([key, value]) => old[key as keyof typeof old] !== value,
      )
    )
      await ctx.db.patch(old._id, value);
  } else await ctx.db.insert("liveReferralRanks", value);
}
