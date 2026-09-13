import { syncHall } from "./hallModel";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { audit } from "./rewardModel";
import { cascade } from "./rewards";
export const record = internalMutation({
  args: {
    takeoverId: v.id("takeovers"),
    paymentIntentId: v.string(),
    eventId: v.string(),
    reason: v.union(v.literal("refunded"), v.literal("chargeback")),
    livemode: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", a.takeoverId))
      .unique();
    if (
      !p ||
      a.livemode !== (p.environment === "production") ||
      (p.paymentIntentId && p.paymentIntentId !== a.paymentIntentId)
    )
      throw new Error("Payment issue mismatch");
    const old = await ctx.db
      .query("adminAudit")
      .withIndex("by_target", (q) =>
        q.eq("target", "payment-event:" + a.eventId),
      )
      .first();
    if (old) return null;
    await ctx.db.patch(p._id, {
      paymentIssue: a.reason,
      paymentIntentId: a.paymentIntentId,
    });
    await audit(
      ctx,
      "payment-provider",
      "PAYMENT_ISSUE",
      "payment-event:" + a.eventId,
      { purchaseId: p._id, reason: a.reason },
    );
    const claims = await ctx.db
      .query("rewardClaims")
      .withIndex("by_takeover", (q) => q.eq("takeoverId", p.takeoverId))
      .take(100);
    for (const c of claims) {
      const r = await ctx.db.get(c.rewardId);
      if (c.status === "paid" || r?.payoutStatus === "sent")
        await audit(ctx, "payment-provider", "PAYOUT_REQUIRES_REVIEW", c._id, {
          reason: a.reason,
        });
      else
        await cascade(ctx, c._id, "ineligible", a.reason, "payment-provider");
    }
    await syncHall(ctx, p.takeoverId);
    return null;
  },
});
