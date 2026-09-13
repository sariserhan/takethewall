import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { audit, requireAdmin } from "./rewardModel";
import { hallEligible, syncHall } from "./hallModel";
export const settings = query({
  args: {},
  returns: v.object({ enabled: v.boolean(), ready: v.boolean() }),
  handler: async (ctx) => {
    const s = await ctx.db
      .query("growthSettings")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    return { enabled: s?.hallEnabled ?? false, ready: s?.hallReady ?? false };
  },
});
export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { enabled }) => {
    const actor = await requireAdmin(ctx);
    const s = await ctx.db
      .query("growthSettings")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    if (s) await ctx.db.patch(s._id, { hallEnabled: enabled });
    else
      await ctx.db.insert("growthSettings", {
        key: "current",
        historyEnabled: true,
        hallEnabled: enabled,
      });
    if (enabled && !s?.hallReady)
      await ctx.scheduler.runAfter(0, internal.hall.backfill, {});
    await audit(ctx, actor, "HALL_VISIBILITY_CHANGED", "growth", { enabled });
    return null;
  },
});
export const backfill = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const s = await ctx.db
      .query("growthSettings")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    if (!s?.hallEnabled || s.hallReady) return null;
    const page = await ctx.db
      .query("takeovers")
      .withIndex("by_activationSequence")
      .paginate({ cursor: s.hallCursor ?? null, numItems: 100 });
    for (const t of page.page) await syncHall(ctx, t._id);
    await ctx.db.patch(s._id, {
      hallReady: page.isDone,
      hallCursor: page.isDone ? null : page.continueCursor,
    });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.hall.backfill, {});
    return null;
  },
});
export const leaders = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      ready: v.boolean(),
      entries: v.array(
        v.object({
          category: v.union(
            v.literal("reign"),
            v.literal("referrals"),
            v.literal("clicks"),
          ),
          publicId: v.string(),
          name: v.string(),
          value: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const s = await ctx.db
      .query("growthSettings")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    if (!s?.hallEnabled) return null;
    if (!s.hallReady) return { ready: false, entries: [] };
    const rows = await Promise.all([
      ctx.db
        .query("hallEntries")
        .withIndex("by_reign", (q) =>
          q.eq("eligible", true).eq("completed", true).gt("reignMs", 0),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("hallEntries")
        .withIndex("by_referrals", (q) =>
          q.eq("eligible", true).gt("referrals", 0),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("hallEntries")
        .withIndex("by_clicks", (q) => q.eq("eligible", true).gt("clicks", 0))
        .order("desc")
        .first(),
    ]);
    const entries = [];
    for (const [i, row] of rows.entries()) {
      if (!row) continue;
      const t = await ctx.db.get(row.takeoverId);
      if (!t || !(await hallEligible(ctx, t))) continue;
      const category = (["reign", "referrals", "clicks"] as const)[i];
      entries.push({
        category,
        publicId: t.publicTakeoverId!,
        name: t.displayName ?? t.domain,
        value: category === "reign" ? row.reignMs : row[category],
      });
    }
    return { ready: true, entries };
  },
});
