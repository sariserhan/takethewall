import {incrementFunnel} from "./funnel";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { daily, enqueue, getSite, limit, receipt } from "./model";
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
      a.expiresAt < now ||
      a.issuedAt > now ||
      a.expiresAt - a.issuedAt > 300_000
    )
      throw new Error("Event context expired");
    const t = await ctx.db.get(a.takeoverId);
    if (
      !t?.activatedAt ||
      a.issuedAt < t.activatedAt ||
      (t.replacedAt !== undefined &&
        (a.issuedAt > t.replacedAt || now > t.replacedAt + 120_000))
    )
      throw new Error("Invalid reign attribution");
    if (a.event === "click" && (t.contentType === "personal" || t.outboundLinkEnabled === false)) return false;
    await limit(ctx, "events:" + a.visitorHash, 90);
    if (a.event === "click") await limit(ctx, "clicks:" + a.visitorHash, 20);
    const eventKey =
      a.event === "impression"
        ? `impression:${a.takeoverId}:${a.pageId}`
        : `event:${a.visitorHash}:${a.eventId}`;
    if (!(await receipt(ctx, eventKey))) return false;
    if (a.event === "take_wall_clicked" || a.event === "checkout_started") {
      await enqueue(ctx, a.event, t._id, a.eventId, {
        visitorHash: a.visitorHash,
        pageId: a.pageId,
        region: a.region,
      });
      return true;
    }
    const site = await getSite(ctx),
      d = await daily(ctx);
    const region = /^[A-Z]{2}$/.test(a.region) ? a.region : "ZZ";
    if (a.event === "impression") {
      if(await receipt(ctx,"funnel-visit:"+a.pageId)) await incrementFunnel(ctx,"funnelVisits");
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
          q.eq("date", d.date).eq("visitorHash", a.visitorHash),
        )
        .unique();
      if (!today)
        await ctx.db.insert("dailyVisitors", {
          date: d.date,
          visitorHash: a.visitorHash,
          expiresAt: now + 3 * 86400_000,
        });
      await ctx.db.patch(t._id, {
        impressions: t.impressions + 1,
        uniqueVisitors: t.uniqueVisitors + (seen ? 0 : 1),
      });
      await ctx.db.patch(site._id, {
        totalVisitors: site.totalVisitors + (lifetime ? 0 : 1),
        updatedAt: now,
      });
      await ctx.db.patch(d._id, {
        visitors: d.visitors + (today ? 0 : 1),
        impressions: d.impressions + 1,
      });
      const r = await ctx.db
        .query("takeoverRegions")
        .withIndex("by_takeoverId_regionCode", (q) =>
          q.eq("takeoverId", t._id).eq("regionCode", region),
        )
        .unique();
      if (r)
        await ctx.db.patch(r._id, {
          impressions: r.impressions + 1,
          uniqueVisitors: r.uniqueVisitors + (seen ? 0 : 1),
        });
      else
        await ctx.db.insert("takeoverRegions", {
          takeoverId: t._id,
          regionCode: region,
          impressions: 1,
          uniqueVisitors: seen ? 0 : 1,
        });
      await enqueue(ctx, "wall_impression", t._id, a.pageId, {
        visitorHash: a.visitorHash,
        pageId: a.pageId,
        region,
      });
    } else {
      await ctx.db.patch(t._id, { clicks: t.clicks + 1 });
      await ctx.db.patch(d._id, { clicks: d.clicks + 1 });
      await enqueue(ctx, "wall_owner_link_click", t._id, a.eventId, {
        visitorHash: a.visitorHash,
        pageId: a.pageId,
        region,
      });
    }
    return true;
  },
});
