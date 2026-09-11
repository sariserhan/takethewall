import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { limit } from "./model";
export const reserve = internalMutation({
  args: { key: v.string(), ownerHash: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    await limit(ctx, "upload:" + a.ownerHash, 6, 3600_000);
    await limit(ctx, "uploads:global", 120, 3600_000);
    await ctx.db.insert("uploads", {
      ...a,
      claimed: false,
      expiresAt: Date.now() + 48 * 3600_000,
    });
    return null;
  },
});
export const finish = internalMutation({
  args: { key: v.string(), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, a) => {
    const u = await ctx.db
      .query("uploads")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .unique();
    if (!u || u.storageId || u.expiresAt < Date.now())
      throw new Error("Upload authorization expired");
    await ctx.db.patch(u._id, { storageId: a.storageId });
    return null;
  },
});
