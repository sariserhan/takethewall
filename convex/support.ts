import {
  checkoutFeedbackReasons,
  type CheckoutFeedbackReason,
} from "../lib/checkout-feedback";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { limit } from "./model";
import { plainText } from "../lib/content";
import { validateEmail } from "../lib/validation";
export const topics = [
  "General question",
  "Payment issue",
  "Wall issue",
  "Milestone reward",
  "Report content",
  "Technical problem",
  "Business inquiry",
  "Other",
];
export const submit = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    topic: v.string(),
    message: v.string(),
    ipHash: v.string(),
    honeypot: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    await limit(ctx, "contact:" + a.ipHash, 5, 3600_000);
    await limit(ctx, "contact:global", 100, 3600_000);
    if (a.honeypot) return null;
    if (!topics.includes(a.topic)) throw new Error("Choose a topic");
    const message = plainText(a.message, 10000, true, true);
    if ((message.match(/https?:\/\//g) ?? []).length > 10)
      throw new Error("Too many links");
    await ctx.db.insert("supportTickets", {
      name: plainText(a.name, 100, false),
      email: validateEmail(a.email),
      topic: a.topic,
      message,
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const reportContent = internalMutation({
  args: {
    takeoverId: v.id("takeovers"),
    reason: v.string(),
    details: v.string(),
    email: v.string(),
    honeypot: v.string(),
    ipHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    await limit(ctx, "report:" + a.ipHash, 5, 3600_000);
    await limit(ctx, "report:global", 100, 3600_000);
    if (a.honeypot) return null;
    const t = await ctx.db.get(a.takeoverId);
    if (!t?.activatedAt || t.status === "pending")
      throw new Error("Placement unavailable");
    const reason = plainText(a.reason, 100),
      details = plainText(a.details, 2000, true, true);
    if (details.length < 10) throw new Error("Please describe the issue");
    await ctx.db.insert("supportTickets", {
      name: "Content report",
      email: a.email.trim() ? validateEmail(a.email) : "",
      topic: "Report content",
      message: `${reason}\n\n${details}`,
      takeoverId: t._id,
      reportedContent: JSON.stringify({
        displayName: t.displayName ?? t.domain,
        websiteUrl: t.websiteUrl,
        description: t.description,
        activatedAt: t.activatedAt,
      }),
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

// Anonymous feedback is visible only through the existing administrator inbox.
export const checkoutFeedback = internalMutation({
  args: {
    reason: v.string(),
    stage: v.union(v.literal("design"), v.literal("preview")),
    details: v.string(),
    ipHash: v.string(),
    honeypot: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    await limit(ctx, "checkout-feedback:" + a.ipHash, 3, 3600_000);
    await limit(ctx, "checkout-feedback:global", 100, 3600_000);
    if (a.honeypot) return null;
    if (!checkoutFeedbackReasons.includes(a.reason as CheckoutFeedbackReason))
      throw new Error("Choose a feedback reason.");
    const details = plainText(a.details, 500, false, true);
    const now = Date.now();
    await ctx.db.insert("supportTickets", {
      name: "Anonymous checkout feedback",
      email: "",
      topic: "Checkout feedback",
      message: `Stage: ${a.stage}\nReason: ${a.reason}${details ? "\n\n" + details : ""}`,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});
