import { query, internalMutation, internalQuery } from "./_generated/server";
import { demoValues } from "./demoValues";
import { v } from "convex/values";
import { getSite, projectOwner, publicOwner, zeros } from "./model";
export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      owner: publicOwner,
      demoStats: v.union(v.null(), demoValues),
      previousOwnerName: v.union(v.string(), v.null()),
      totalVisitors: v.number(),
      totalTakeovers: v.number(),
      visitorsToday: v.number(),
      utcDate: v.string(),
      regions: v.array(
        v.object({ regionCode: v.string(), impressions: v.number() }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const s = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    if (!s) return null;
    const t = await ctx.db.get(s.currentTakeoverId);
    if (!t) throw new Error("Missing current owner");
    const previous =
      s.currentActivationSequence > 0
        ? await ctx.db
            .query("takeovers")
            .withIndex("by_activationSequence", (q) =>
              q.eq("activationSequence", s.currentActivationSequence - 1),
            )
            .unique()
        : null;
    const utcDate = new Date(s.updatedAt).toISOString().slice(0, 10);
    const d = await ctx.db
      .query("dailyStats")
      .withIndex("by_date", (q) => q.eq("date", utcDate))
      .unique();
    const r = await ctx.db
      .query("takeoverRegions")
      .withIndex("by_takeoverId_regionCode", (q) => q.eq("takeoverId", t._id))
      .take(300);
    const demo = await ctx.db
      .query("demoStats")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    return {
      demoStats:
        demo?.enabled && demo.takeoverId === t._id ? demo.values : null,
      owner: await projectOwner(ctx, t),
      previousOwnerName: previous
        ? previous.blocked || previous.status === "rejected"
          ? "Removed placement"
          : previous.displayName || previous.domain || "House placement"
        : null,
      totalVisitors: s.totalVisitors,
      totalTakeovers: s.totalTakeovers,
      visitorsToday: d?.visitors ?? 0,
      utcDate,
      regions: r.map((x) => ({
        regionCode: x.regionCode,
        impressions: x.impressions,
      })),
    };
  },
});
export const seed = internalMutation({
  args: { logoStorageId: v.id("_storage") },
  returns: v.id("takeovers"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    if (existing) {
      const owner = await ctx.db.get(existing.currentTakeoverId);
      if (owner?.logoStorageId !== args.logoStorageId) {
        const reference = await ctx.db
          .query("takeovers")
          .withIndex("by_logoStorageId", (q) =>
            q.eq("logoStorageId", args.logoStorageId),
          )
          .first();
        if (!reference) await ctx.storage.delete(args.logoStorageId);
      }
      return existing.currentTakeoverId;
    }
    const now = Date.now();
    const id = await ctx.db.insert("takeovers", {
      websiteUrl: "https://visitorping.com/",
      domain: "visitorping.com",
      description: "Know who's on your website right now.",
      logoStorageId: args.logoStorageId,
      kind: "initial_house",
      status: "active",
      blocked: false,
      createdAt: now,
      activatedAt: now,
      activationSequence: 0,
      ...zeros,
    });
    await ctx.db.insert("siteStats", {
      key: "wall",
      currentTakeoverId: id,
      currentActivationSequence: 0,
      totalVisitors: 0,
      totalTakeovers: 0,
      updatedAt: now,
    });
    return id;
  },
});
export const activeContext = internalQuery({
  args: { takeoverId: v.id("takeovers") },
  returns: v.object({
    id: v.id("takeovers"),
    domain: v.string(),
    websiteUrl: v.string(),
  }),
  handler: async (ctx, a) => {
    const s = await getSite(ctx);
    if (s.currentTakeoverId !== a.takeoverId)
      throw new Error("The wall changed.");
    const t = (await ctx.db.get(a.takeoverId))!;
    return { id: t._id, domain: t.domain, websiteUrl: t.websiteUrl };
  },
});
