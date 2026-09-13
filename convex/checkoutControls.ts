import { query, mutation, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, audit } from "./rewardModel";
import { getSite, enqueue } from "./model";
import { notificationSettings } from "./adminNotifications";
export async function isCheckoutPaused(ctx: QueryCtx) {
  return (
    (
      await ctx.db
        .query("growthSettings")
        .withIndex("by_key", (q) => q.eq("key", "current"))
        .unique()
    )?.checkoutPaused ?? false
  );
}
export const state = query({
  args: {},
  returns: v.object({
    paused: v.boolean(),
    ownerId: v.id("takeovers"),
    ownerName: v.string(),
  }),
  handler: async (ctx) => {
    const site = await getSite(ctx);
    const owner = await ctx.db.get(site.currentTakeoverId);
    return {
      paused: await isCheckoutPaused(ctx),
      ownerId: site.currentTakeoverId,
      ownerName: owner?.blocked
        ? "Removed placement"
        : owner?.displayName || owner?.domain || "House placement",
    };
  },
});
export const setPaused = mutation({
  args: { paused: v.boolean() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    const settings = await ctx.db
      .query("growthSettings")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    if (settings)
      await ctx.db.patch(settings._id, { checkoutPaused: a.paused });
    else
      await ctx.db.insert("growthSettings", {
        key: "current",
        historyEnabled: true,
        checkoutPaused: a.paused,
      });
    await audit(ctx, actor, "CHECKOUT_PAUSE_CHANGED", "checkout", {
      paused: a.paused,
    });
    return null;
  },
});
export const publicationFailure = internalMutation({
  args: {
    takeoverId: v.id("takeovers"),
    sessionId: v.string(),
    paymentIntentId: v.string(),
    livemode: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", a.takeoverId))
      .unique();
    const t = await ctx.db.get(a.takeoverId);
    if (
      !p ||
      !t ||
      (p.sessionId && p.sessionId !== a.sessionId) ||
      p.paidAt ||
      p.environment !== (process.env.WALL_ENVIRONMENT ?? "test") ||
      a.livemode !== (p.environment === "production")
    )
      return null;
    await ctx.db.patch(p._id, {
      stripeStatus: "paid",
      stripeCheckedAt: Date.now(),
    });
    const key = `admin_payment_failure_email:${t._id}:${a.sessionId}`;
    if (
      await ctx.db
        .query("jobs")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique()
    )
      return null;
    await audit(ctx, "system", "PAID_PUBLICATION_FAILED", t._id, {
      sessionId: a.sessionId,
      paymentIntentId: a.paymentIntentId,
      environment: p.environment,
    });
    const settings = await notificationSettings(ctx);
    if (!settings.enabled || p.environment !== "production") return null;
    await enqueue(ctx, "admin_payment_failure_email", t._id, a.sessionId);
    const job = (await ctx.db
      .query("jobs")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique())!;
    await ctx.db.patch(job._id, {
      adminRecipient: settings.recipient,
      adminNotice: {
        subject: "Action needed: paid takeover could not publish",
        body: `Stripe confirmed a $3.99 payment, but the app could not complete publication.\nTakeover: ${t._id}\nProject: ${t.displayName || t.domain}\nStripe checkout: ${a.sessionId}\nStripe payment: ${a.paymentIntentId}\nOpen Admin → Takeovers → Inspect → Check Stripe status. A later retry may already have recovered this payment; check before acting.`,
      },
    });
    return null;
  },
});
