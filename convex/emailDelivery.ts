import { applyProviderSuppression } from "./emailPolicy";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { audit } from "./rewardModel";
import { resendEventTypes } from "../lib/resend-events";
export const record = internalMutation({
  args: {
    eventId: v.string(),
    emailId: v.string(),
    type: v.union(...resendEventTypes.map((type) => v.literal(type))),
    occurredAt: v.number(),
    bounceType: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    if (
      !a.eventId ||
      a.eventId.length > 200 ||
      !a.emailId ||
      a.emailId.length > 100 ||
      !Number.isFinite(a.occurredAt)
    )
      throw new Error("Invalid delivery event");
    const existing = await ctx.db
      .query("emailEvents")
      .withIndex("by_event", (q) => q.eq("eventId", a.eventId))
      .unique();
    if (!existing)
      await ctx.db.insert("emailEvents", {
        eventId: a.eventId,
        providerId: a.emailId,
        type: a.type,
        occurredAt: a.occurredAt,
        ...(a.bounceType ? { bounceType: a.bounceType.slice(0, 40) } : {}),
      });
    if (existing && !existing.bounceType && a.bounceType)
      await ctx.db.patch(existing._id, {
        bounceType: a.bounceType.slice(0, 40),
      });
    const sends = await ctx.db
      .query("emailHistory")
      .withIndex("by_provider", (q) => q.eq("providerId", a.emailId))
      .take(10);
    for (const send of sends)
      await applyProviderSuppression(ctx, send.email, a.emailId);
    const target = "resend:" + a.eventId;
    if (
      await ctx.db
        .query("adminAudit")
        .withIndex("by_target", (q) => q.eq("target", target))
        .first()
    )
      return null;
    await audit(
      ctx,
      "resend",
      "EMAIL_" + a.type.slice(6).toUpperCase(),
      target,
      { emailId: a.emailId, occurredAt: a.occurredAt },
    );
    return null;
  },
});
