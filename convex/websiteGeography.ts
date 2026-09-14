import { v } from "convex/values";
import { internalAction, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { websiteGeography } from "./geographyModel";
import { readWebsiteGeography } from "../lib/visitorping-geography";
import { VisitorPingReadError } from "../lib/visitorping-api";
const REFRESH_MS = 30 * 60_000;
export const report = query({
  args: {},
  returns: v.object({
    snapshot: v.union(websiteGeography, v.null()),
    failed: v.boolean(),
  }),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("websiteGeographyReports")
      .withIndex("by_key", (q) => q.eq("key", "website"))
      .unique();
    if (!row || row.siteId !== process.env.VISITORPING_SITE_ID)
      return { snapshot: null, failed: false };
    return { snapshot: row.snapshot ?? null, failed: row.failed };
  },
});
export const claim = internalMutation({
  args: { siteId: v.string() },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, a) => {
    const row = await ctx.db
      .query("websiteGeographyReports")
      .withIndex("by_key", (q) => q.eq("key", "website"))
      .unique();
    if (row?.siteId === a.siteId && row.nextAt > Date.now()) return null;
    const attempt = (row?.attempt ?? 0) + 1;
    const fields = {
      siteId: a.siteId,
      attempt,
      nextAt: Date.now() + 60_000,
      failed: false,
    };
    if (row)
      await ctx.db.patch(row._id, {
        ...fields,
        ...(row.siteId !== a.siteId ? { snapshot: undefined } : {}),
      });
    else
      await ctx.db.insert("websiteGeographyReports", {
        key: "website",
        ...fields,
      });
    return attempt;
  },
});
export const finish = internalMutation({
  args: {
    siteId: v.string(),
    attempt: v.number(),
    snapshot: v.optional(websiteGeography),
    retryAfterMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const row = await ctx.db
      .query("websiteGeographyReports")
      .withIndex("by_key", (q) => q.eq("key", "website"))
      .unique();
    if (!row || row.siteId !== a.siteId || row.attempt !== a.attempt)
      return null;
    await ctx.db.patch(row._id, {
      ...(a.snapshot ? { snapshot: a.snapshot } : {}),
      failed: !a.snapshot,
      nextAt: Date.now() + Math.max(REFRESH_MS, a.retryAfterMs ?? 0),
    });
    return null;
  },
});
export const refresh = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const apiKey = process.env.VISITORPING_API_KEY,
      siteId = process.env.VISITORPING_SITE_ID;
    if (!apiKey || !siteId) return null;
    const attempt = await ctx.runMutation(internal.websiteGeography.claim, {
      siteId,
    });
    if (attempt === null) return null;
    try {
      const snapshot = await readWebsiteGeography({ apiKey, siteId });
      await ctx.runMutation(internal.websiteGeography.finish, {
        siteId,
        attempt,
        snapshot,
      });
    } catch (error) {
      await ctx.runMutation(internal.websiteGeography.finish, {
        siteId,
        attempt,
        retryAfterMs:
          error instanceof VisitorPingReadError
            ? error.retryAfterMs
            : REFRESH_MS,
      });
    }
    return null;
  },
});
