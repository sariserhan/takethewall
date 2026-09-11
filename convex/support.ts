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
