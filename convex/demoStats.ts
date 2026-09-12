import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { demoValues } from "./demoValues";
import { audit, requireAdmin } from "./rewardModel";
export const read = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      enabled: v.boolean(),
      values: demoValues,
      activeForCurrentOwner: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query("demoStats")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    if (!row) return null;
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    return {
      enabled: row.enabled,
      values: row.values,
      activeForCurrentOwner:
        row.enabled && row.takeoverId === site?.currentTakeoverId,
    };
  },
});
export const save = mutation({
  args: {
    enabled: v.boolean(),
    values: demoValues,
    reason: v.string(),
    expectedCurrentId: v.id("takeovers"),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    if (!a.reason.trim() || a.reason.length > 1000)
      throw new Error("Enter a reason (up to 1,000 characters).");
    for (const value of Object.values(a.values))
      if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000)
        throw new Error(
          "Sample counts must be whole numbers from 0 to 1 billion.",
        );
    if (
      a.values.visitorsToday > a.values.totalVisitors ||
      a.values.uniqueVisitors > a.values.impressions ||
      a.values.clicks > a.values.impressions
    )
      throw new Error(
        "Sample totals must be consistent: today's visitors cannot exceed total visitors, and unique visitors/clicks cannot exceed impressions.",
      );
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    if (!site || site.currentTakeoverId !== a.expectedCurrentId)
      throw new Error("The wall changed. Reload and review the current owner.");
    const row = await ctx.db
      .query("demoStats")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    const next = {
      enabled: a.enabled,
      values: a.values,
      takeoverId: site.currentTakeoverId,
      updatedAt: Date.now(),
    };
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("demoStats", { key: "current", ...next });
    await audit(ctx, actor, "DEMO_STATS_UPDATED", site.currentTakeoverId, {
      reason: a.reason.trim(),
      before: row
        ? {
            enabled: row.enabled,
            values: row.values,
            takeoverId: row.takeoverId,
          }
        : null,
      after: next,
    });
    return null;
  },
});
