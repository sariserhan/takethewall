import { historicalViews } from "./visitTotals";
import { addCityDelta, afterCitySnapshot, applyCityDelta } from "./radarCityModel";
import { createVisit, enrichVisit } from "./visitLedger";
import { syncHall } from "./hallModel";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { daily, getSite, limit, receipt } from "./model";
export const rate = internalMutation({
  args: { key: v.string(), max: v.number(), windowMs: v.number() },
  returns: v.null(),
  handler: async (ctx, a) => {
    await limit(ctx, a.key, a.max, a.windowMs);
    return null;
  },
});
export const record = internalMutation({
  args: {
    takeoverId: v.id("takeovers"),
    visitorHash: v.string(),
    pageId: v.string(),
    eventId: v.string(),
    event: v.union(
      v.literal("impression"),
      v.literal("click"),
      v.literal("take_wall_clicked"),
      v.literal("checkout_started"),
    ),
    region: v.string(),
    city: v.optional(v.string()),
    source: v.optional(v.union(v.literal("vercel"), v.literal("visitorping"))),
    issuedAt: v.number(),
    expiresAt: v.number(),
    excluded: v.boolean(),
  },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    if (a.excluded || process.env.PUBLIC_METRICS_ENABLED !== "true")
      return false;
    const now = Date.now();
    if (
      a.expiresAt + (a.source === "visitorping" ? 86400_000 : 0) < now ||
      a.issuedAt > now ||
      a.expiresAt - a.issuedAt > 300_000
    )
      throw new Error("Event context expired");
    const t = await ctx.db.get(a.takeoverId);
    if (
      !t?.activatedAt ||
      a.issuedAt < t.activatedAt ||
      (t.replacedAt !== undefined &&
        (a.issuedAt > t.replacedAt || (a.source !== "visitorping" && now > t.replacedAt + 120_000)))
    )
      throw new Error("Invalid reign attribution");
    if (
      a.event === "click" &&
      (t.contentType === "personal" || t.outboundLinkEnabled === false)
    )
      return false;
    await limit(ctx, "events:" + a.visitorHash, 90);
    if (a.event === "click") await limit(ctx, "clicks:" + a.visitorHash, 20);
    const eventKey =
      a.event === "impression"
        ? `impression:${a.takeoverId}:${a.pageId}`
        : `event:${a.visitorHash}:${a.eventId}`;
    if (a.event === "impression") {
      const prior = await ctx.db.query("visitLedger").withIndex("by_key", q => q.eq("key", eventKey)).unique();
      if (prior) {
        await enrichVisit(ctx, prior, a);
        return false;
      }
    }
    if (!(await receipt(ctx, eventKey))) return false;
    if (a.event === "take_wall_clicked" || a.event === "checkout_started") {
      return true;
    }
    const date = new Date(a.issuedAt).toISOString().slice(0, 10);
    let visitId: Id<"visitLedger"> | undefined;
    let fresh = false,
      freshSite = false,
      freshDay = false,
      funnelVisit = false;
    if (a.event === "impression") {
      funnelVisit = await receipt(ctx, "funnel-visit:" + a.pageId);
      const seen = await ctx.db
        .query("takeoverVisitors")
        .withIndex("by_takeoverId_visitorHash", (q) =>
          q.eq("takeoverId", t._id).eq("visitorHash", a.visitorHash),
        )
        .unique();
      if (!seen)
        await ctx.db.insert("takeoverVisitors", {
          takeoverId: t._id,
          visitorHash: a.visitorHash,
          firstSeenAt: now,
        });
      const lifetime = await ctx.db
        .query("siteVisitors")
        .withIndex("by_visitorHash", (q) => q.eq("visitorHash", a.visitorHash))
        .unique();
      if (!lifetime)
        await ctx.db.insert("siteVisitors", {
          visitorHash: a.visitorHash,
          firstSeenAt: now,
        });
      const today = await ctx.db
        .query("dailyVisitors")
        .withIndex("by_date_visitorHash", (q) =>
          q.eq("date", date).eq("visitorHash", a.visitorHash),
        )
        .unique();
      if (!today)
        await ctx.db.insert("dailyVisitors", {
          date,
          visitorHash: a.visitorHash,
          expiresAt: now + 3 * 86400_000,
        });
      fresh = !seen;
      freshSite = !lifetime;
      freshDay = !today;
      visitId = await createVisit(ctx, { ...a, key: eventKey, occurredAt: a.issuedAt, freshReign: fresh });
    }
    // Independent buckets avoid a shared write for every incoming impression.
    const shard =
      [...a.visitorHash].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0) %
      16;
    const batch = await ctx.db
      .query("analyticsBatches")
      .withIndex("by_bucket", (q) =>
        q.eq("takeoverId", t._id).eq("date", date).eq("shard", shard),
      )
      .unique();
    const impression = a.event === "impression" ? 1 : 0;
    const regions = batch?.regions ?? [];
    const cities = batch?.cities ?? [];
    const trackCity = !!visitId && afterCitySnapshot(a.issuedAt);
    if (trackCity) addCityDelta(cities, (a.city ?? "").trim().slice(0,160), /^[A-Z]{2}$/.test(a.region) ? a.region : "ZZ", 1);
    const values = {
      impressions: (batch?.impressions ?? 0) + impression,
      uniqueVisitors: (batch?.uniqueVisitors ?? 0) + Number(fresh),
      siteVisitors: (batch?.siteVisitors ?? 0) + Number(freshSite),
      dailyVisitors: (batch?.dailyVisitors ?? 0) + Number(freshDay),
      clicks: (batch?.clicks ?? 0) + Number(a.event === "click"),
      funnelVisits:
        (batch?.funnelVisits ?? 0) +
        Number(funnelVisit && process.env.WALL_ENVIRONMENT === "production"),
      regions,
      cities,
    };
    let batchId = batch?._id;
    if (batch) await ctx.db.patch(batch._id, values);
    else {
      const id = await ctx.db.insert("analyticsBatches", {
        takeoverId: t._id,
        date,
        shard,
        ...values,
      });
      batchId = id;
      await ctx.scheduler.runAfter(
        10_000 + shard * 300,
        internal.analytics.flush,
        { id },
      );
    }
    if (trackCity && visitId && batchId) await ctx.db.patch(visitId, { cityBatchId: batchId });
    return true;
  },
});

// Applying and deleting the delta is one transaction: retries cannot double count.
export const flush = internalMutation({
  args: { id: v.id("analyticsBatches") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const b = await ctx.db.get(id);
    if (!b) return null;
    const t = await ctx.db.get(b.takeoverId);
    if (!t) throw new Error("Analytics owner missing");
    const site = await getSite(ctx),
      d = await daily(ctx, b.date);
    await ctx.db.patch(t._id, {
      impressions: t.impressions + b.impressions,
      uniqueVisitors: t.uniqueVisitors + b.uniqueVisitors,
      clicks: t.clicks + b.clicks,
    });
    await ctx.db.patch(site._id, {
      totalVisitors: site.totalVisitors + b.siteVisitors,
      totalViews: (site.totalViews ?? await historicalViews(ctx)) + b.impressions,
      updatedAt: Math.max(site.updatedAt, Date.now()),
    });
    await ctx.db.patch(d._id, {
      visitors: d.visitors + b.dailyVisitors,
      impressions: d.impressions + b.impressions,
      clicks: d.clicks + b.clicks,
      ...(b.funnelVisits
        ? {
            funnelVisits: (d.funnelVisits ?? 0) + b.funnelVisits,
            funnelStartedAt: d.funnelStartedAt ?? Date.now(),
          }
        : {}),
    });
    for (const delta of b.cities ?? []) await applyCityDelta(ctx, b.date, delta);
    for (const delta of b.regions) {
      const r = await ctx.db
        .query("takeoverRegions")
        .withIndex("by_takeoverId_regionCode", (q) =>
          q.eq("takeoverId", t._id).eq("regionCode", delta.code),
        )
        .unique();
      if (r)
        await ctx.db.patch(r._id, {
          impressions: r.impressions + delta.impressions,
          uniqueVisitors: r.uniqueVisitors + delta.uniqueVisitors,
        });
      else
        await ctx.db.insert("takeoverRegions", {
          takeoverId: t._id,
          regionCode: delta.code,
          impressions: delta.impressions,
          uniqueVisitors: delta.uniqueVisitors,
        });
    }
    await syncHall(ctx, t._id);
    await ctx.db.delete(id);
    return null;
  },
});

export const recover = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("analyticsBatches")
      .withIndex("by_bucket")
      .take(100);
    for (const b of rows)
      await ctx.scheduler.runAfter(0, internal.analytics.flush, { id: b._id });
    return null;
  },
});

// Final reports must not freeze while durable, accepted events await aggregation.
// The indexed read also makes the snapshot transaction conflict with new batches.
export async function deferForAnalytics(
  ctx: MutationCtx,
  takeoverId: Id<"takeovers">,
): Promise<boolean> {
  const batches = await ctx.db
    .query("analyticsBatches")
    .withIndex("by_bucket", (q) => q.eq("takeoverId", takeoverId))
    .take(32);
  for (const batch of batches)
    await ctx.scheduler.runAfter(0, internal.analytics.flush, {
      id: batch._id,
    });
  return batches.length > 0;
}
