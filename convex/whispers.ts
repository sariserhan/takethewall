import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getSite, limit } from "./model";
import { requireAdmin } from "./rewardModel";
const row = v.object({
  id: v.id("whispers"),
  text: v.string(),
  createdAt: v.number(),
});
export const messages = query({
  args: { takeoverId: v.id("takeovers") },
  returns: v.array(row),
  handler: async (ctx, a) => {
    const owner = await ctx.db.get(a.takeoverId);
    if (
      !owner ||
      owner.blocked ||
      (await getSite(ctx)).currentTakeoverId !== owner._id
    )
      return [];
    const rows = await ctx.db
      .query("whispers")
      .withIndex("by_owner_visible", (q) =>
        q.eq("takeoverId", a.takeoverId).eq("hidden", false),
      )
      .order("desc")
      .take(50);
    return rows
      .reverse()
      .map((r) => ({ id: r._id, text: r.text, createdAt: r.createdAt }));
  },
});
export const post = internalMutation({
  args: {
    takeoverId: v.id("takeovers"),
    text: v.string(),
    ipHash: v.string(),
    honeypot: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    if (a.honeypot) return null;
    const text = a.text.trim();
    if (
      !text ||
      Array.from(text).length > 50 ||
      /[\r\n\x00-\x1f]/.test(text) ||
      !a.ipHash
    )
      throw Error("Use 1–50 characters on one line.");
    const owner = await ctx.db.get(a.takeoverId);
    if (
      !owner ||
      owner.blocked ||
      owner.status !== "active" ||
      (await getSite(ctx)).currentTakeoverId !== owner._id
    )
      throw Error("The wall changed. Reopen Whisper.");
    await limit(ctx, "whisper:" + a.ipHash, 3, 60_000);
    await limit(ctx, "whisper-wall:" + a.takeoverId, 30, 60_000);
    await ctx.db.insert("whispers", {
      takeoverId: a.takeoverId,
      text,
      hidden: false,
      createdAt: Date.now(),
    });
    return null;
  },
});
export const remove = mutation({
  args: { id: v.id("whispers") },
  returns: v.null(),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    if (await ctx.db.get(a.id)) await ctx.db.patch(a.id, { hidden: true });
    return null;
  },
});
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("whispers")
      .withIndex("by_created", (q) =>
        q.lt("createdAt", Date.now() - 10 * 60_000),
      )
      .take(500);
    for (const row of rows) await ctx.db.delete(row._id);
    return null;
  },
});
