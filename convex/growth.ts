import { ownerAccess } from "./ownerModel";
import { syncHall } from "./hallModel";
import {
  internalQuery,
  internalMutation,
  query,
  mutation,
} from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireAdmin, audit } from "./rewardModel";
const visible = (t: Doc<"takeovers">) =>
  !!t.publicTakeoverId &&
  t.activatedAt !== undefined &&
  !t.blocked &&
  (t.status === "active" || t.status === "replaced") &&
  t.kind !== "moderation_restoration";
export const indexable = (t: Doc<"takeovers">) =>
  visible(t) &&
  (t.contentType === "personal" || t.outboundLinkEnabled !== false) &&
  t.seoApproved === true &&
  t.seoRevision === (t.contentRevision ?? 0) &&
  (t.seoSummary?.trim().length ?? 0) >= 120;
const entry = v.object({
  publicId: v.string(),
  name: v.string(),
  description: v.string(),
  image: v.union(v.string(), v.null()),
  activatedAt: v.number(),
  replacedAt: v.union(v.number(), v.null()),
  sequence: v.number(),
  live: v.boolean(),
});
const historyResult = v.object({
  entries: v.array(entry),
  next: v.union(v.number(), v.null()),
});
async function historyEnabled(ctx: QueryCtx) {
  const settings = await ctx.db
    .query("growthSettings")
    .withIndex("by_key", (q) => q.eq("key", "current"))
    .unique();
  return settings?.historyEnabled ?? true;
}
async function historyPage(ctx: QueryCtx, a: { before?: number }) {
  const rows = await ctx.db
    .query("takeovers")
    .withIndex("by_activationSequence", (q) =>
      q
        .gt("activationSequence", 0)
        .lt("activationSequence", a.before ?? Number.MAX_SAFE_INTEGER),
    )
    .order("desc")
    .take(24);
  return {
    entries: await Promise.all(
      rows.filter(visible).map(async (t) => ({
        publicId: t.publicTakeoverId!,
        name: t.displayName ?? t.domain,
        description: t.description,
        image: t.logoStorageId
          ? await ctx.storage.getUrl(t.logoStorageId)
          : null,
        activatedAt: t.activatedAt!,
        replacedAt: t.replacedAt ?? null,
        sequence: t.activationSequence!,
        live: t.status === "active",
      })),
    ),
    next: rows.length === 24 ? rows.at(-1)!.activationSequence! : null,
  };
}
export const visibility = query({
  args: {},
  returns: v.boolean(),
  handler: historyEnabled,
});
export const setHistoryVisibility = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    const settings = await ctx.db
      .query("growthSettings")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    if (settings)
      await ctx.db.patch(settings._id, { historyEnabled: a.enabled });
    else
      await ctx.db.insert("growthSettings", {
        key: "current",
        historyEnabled: a.enabled,
      });
    await audit(ctx, actor, "HISTORY_VISIBILITY_CHANGED", "growth", {
      enabled: a.enabled,
    });
    return null;
  },
});
export const history = internalQuery({
  args: { before: v.optional(v.number()) },
  returns: v.union(v.null(), historyResult),
  handler: async (ctx, a) =>
    (await historyEnabled(ctx)) ? historyPage(ctx, a) : null,
});
export const adminHistory = query({
  args: { before: v.optional(v.number()) },
  returns: historyResult,
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    return historyPage(ctx, a);
  },
});
export const visit = internalMutation({
  args: {
    publicId: v.string(),
    visitorHash: v.string(),
    ownerToken: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    if (
      process.env.WALL_ENVIRONMENT !== "production" ||
      process.env.PUBLIC_METRICS_ENABLED !== "true" ||
      !/^[a-f0-9]{64}$/.test(a.visitorHash)
    )
      return false;
    const t = await ctx.db
      .query("takeovers")
      .withIndex("by_publicId", (q) => q.eq("publicTakeoverId", a.publicId))
      .unique();
    if (!t || !visible(t)) return false;
    if (a.ownerToken) {
      const access = await ownerAccess(ctx, a.ownerToken).catch(() => null);
      if (access) {
        if (access.takeoverId === t._id) return false;
        const source = await ctx.db
          .query("purchases")
          .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
          .unique();
        const own = await ctx.db
          .query("purchases")
          .withIndex("by_takeoverId", (q) =>
            q.eq("takeoverId", access.takeoverId),
          )
          .unique();
        if (
          source?.buyerEmail &&
          own?.buyerEmail &&
          source.buyerEmail.toLowerCase() === own.buyerEmail.toLowerCase()
        )
          return false;
      }
    }

    const old = await ctx.db
      .query("referralVisits")
      .withIndex("by_source_visitor", (q) =>
        q.eq("takeoverId", t._id).eq("visitorHash", a.visitorHash),
      )
      .unique();
    if (!old) {
      await ctx.db.insert("referralVisits", {
        takeoverId: t._id,
        visitorHash: a.visitorHash,
        createdAt: Date.now(),
      });
      await ctx.db.patch(t._id, { shareVisitors: (t.shareVisitors ?? 0) + 1 });
      await syncHall(ctx, t._id);
    }
    return true;
  },
});
export const review = mutation({
  args: {
    publicId: v.string(),
    summary: v.string(),
    approved: v.boolean(),
    expectedRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const admin = await requireAdmin(ctx);
    const t = await ctx.db
      .query("takeovers")
      .withIndex("by_publicId", (q) => q.eq("publicTakeoverId", a.publicId))
      .unique();
    if (!t || !visible(t)) throw Error("This takeover is unavailable.");
    if ((t.contentRevision ?? 0) !== a.expectedRevision)
      throw Error("Content changed. Refresh before reviewing.");
    const summary = a.summary.trim();
    if (summary.length > 2000 || (a.approved && summary.length < 120))
      throw Error(
        "Add a useful, original overview of 120–2,000 characters before approving.",
      );
    await ctx.db.patch(t._id, {
      seoApproved: a.approved,
      seoSummary: summary,
      seoRevision: t.contentRevision ?? 0,
      seoReviewedAt: Date.now(),
    });
    await audit(ctx, admin, "SEARCH_REVIEW", t._id, { approved: a.approved });
    return null;
  },
});
export const kit = query({
  args: { publicId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      revision: v.number(),
      summary: v.string(),
      approved: v.boolean(),
      visitors: v.number(),
      purchases: v.number(),
    }),
  ),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const t = await ctx.db
      .query("takeovers")
      .withIndex("by_publicId", (q) => q.eq("publicTakeoverId", a.publicId))
      .unique();
    if (!t || !visible(t)) return null;
    return {
      revision: t.contentRevision ?? 0,
      summary: t.seoSummary ?? "",
      approved: indexable(t),
      visitors: t.shareVisitors ?? 0,
      purchases: t.shareTakeovers ?? 0,
    };
  },
});
export const sitemapCount = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const t = await ctx.db
      .query("takeovers")
      .withIndex("by_seo_sequence", (q) => q.eq("seoApproved", true))
      .order("desc")
      .first();
    return Math.max(1, Math.ceil(((t?.activationSequence ?? 0) + 1) / 1000));
  },
});
export const sitemap = internalQuery({
  args: { page: v.number() },
  returns: v.array(v.object({ publicId: v.string(), modified: v.number() })),
  handler: async (ctx, a) => {
    if (!Number.isSafeInteger(a.page) || a.page < 0)
      throw Error("Invalid sitemap");
    const rows = await ctx.db
      .query("takeovers")
      .withIndex("by_seo_sequence", (q) =>
        q
          .eq("seoApproved", true)
          .gte("activationSequence", a.page * 1000)
          .lt("activationSequence", (a.page + 1) * 1000),
      )
      .take(1000);
    return rows.filter(indexable).map((t) => ({
      publicId: t.publicTakeoverId!,
      modified: t.seoReviewedAt!,
    }));
  },
});
