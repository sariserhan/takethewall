import { syncReferralRank } from "./referralLeaderboardModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
export async function hallEligible(ctx: QueryCtx, t: Doc<"takeovers">) {
  if (
    !t.publicTakeoverId ||
    t.activatedAt === undefined ||
    t.blocked ||
    t.outboundLinkEnabled === false ||
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
    p.environment === "production" &&
    !p.paymentIssue &&
    (t.kind === "admin_counted" || p.paidAt !== undefined)
  );
}
export async function syncHall(ctx: MutationCtx, takeoverId: Id<"takeovers">) {
  await syncReferralRank(ctx, takeoverId);
  const t = await ctx.db.get(takeoverId);
  const old = await ctx.db
    .query("hallEntries")
    .withIndex("by_takeover", (q) => q.eq("takeoverId", takeoverId))
    .unique();
  if (!t || !(await hallEligible(ctx, t))) {
    if (old) await ctx.db.delete(old._id);
    return;
  }
  const value = {
    takeoverId,
    eligible: true,
    completed: t.replacedAt !== undefined,
    reignMs:
      t.replacedAt === undefined
        ? 0
        : Math.max(0, t.replacedAt - t.activatedAt!),
    referrals: t.shareVisitors ?? 0,
    clicks: t.clicks,
  };
  if (old) {
    if (
      old.completed !== value.completed ||
      old.reignMs !== value.reignMs ||
      old.referrals !== value.referrals ||
      old.clicks !== value.clicks
    )
      await ctx.db.patch(old._id, value);
  } else await ctx.db.insert("hallEntries", value);
}
