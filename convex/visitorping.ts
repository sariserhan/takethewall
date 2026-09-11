import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { visitorPingSnapshot } from "./schema";
import {
  readVisitorPingTotals,
  VisitorPingReadError,
} from "../lib/visitorping-api";

// A single shared report avoids multiplying provider requests by browser count.
export const claim = internalMutation({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      attempt: v.number(),
      takeoverId: v.id("takeovers"),
      from: v.string(),
      to: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const now = Date.now();
    const report = await ctx.db
      .query("visitorPingReports")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    if (report && report.nextAt > now) return null;
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    if (!site) return null;
    const owner = await ctx.db.get(site.currentTakeoverId);
    // Allow for small provider clock differences; this is explicitly a retained 24h window.
    const to = now - 5000;
    const from = Math.max(owner?.activatedAt ?? now, to - 86_400_000);
    if (from >= to) return null;
    const attempt = (report?.attempt ?? 0) + 1;
    if (report)
      await ctx.db.patch(report._id, { attempt, nextAt: now + 60_000 });
    else
      await ctx.db.insert("visitorPingReports", {
        key: "current",
        attempt,
        nextAt: now + 60_000,
        failures: 0,
      });
    return {
      attempt,
      takeoverId: site.currentTakeoverId,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    };
  },
});

export const finish = internalMutation({
  args: {
    attempt: v.number(),
    snapshot: v.optional(visitorPingSnapshot),
    error: v.optional(v.string()),
    retryAfterMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const report = await ctx.db
      .query("visitorPingReports")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    if (!report || report.attempt !== args.attempt) return null;
    if (args.snapshot) {
      const site = await ctx.db
        .query("siteStats")
        .withIndex("by_key", (q) => q.eq("key", "wall"))
        .unique();
      // Never attribute a completed read to a newer owner.
      if (site?.currentTakeoverId !== args.snapshot.takeoverId) {
        await ctx.db.patch(report._id, { nextAt: Date.now() });
        return null;
      }
      await ctx.db.patch(report._id, {
        snapshot: args.snapshot,
        failures: 0,
        lastError: undefined,
        nextAt: Date.now() + 30_000,
      });
    } else {
      const failures = report.failures + 1;
      await ctx.db.patch(report._id, {
        failures,
        lastError: args.error ?? "VisitorPing unavailable",
        nextAt:
          Date.now() +
          Math.max(
            args.retryAfterMs ?? 0,
            Math.min(900_000, 30_000 * 2 ** Math.min(failures, 5)),
          ) +
          Math.floor(Math.random() * 5000),
      });
    }
    return null;
  },
});

// Operator-only report. Public lifetime and realtime counters remain independent.
export const report = internalQuery({
  args: {},
  returns: v.object({
    snapshot: v.union(v.null(), visitorPingSnapshot),
    lastError: v.union(v.null(), v.string()),
    nextAt: v.union(v.null(), v.number()),
  }),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("visitorPingReports")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    return {
      snapshot:
        row?.snapshot?.takeoverId === site?.currentTakeoverId
          ? (row?.snapshot ?? null)
          : null,
      lastError: row?.lastError ?? null,
      nextAt: row?.nextAt ?? null,
    };
  },
});

export const refresh = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const apiKey = process.env.VISITORPING_API_KEY;
    const siteId = process.env.VISITORPING_SITE_ID;
    if (
      !apiKey ||
      !siteId ||
      process.env.WALL_ENVIRONMENT !== "production" ||
      process.env.PUBLIC_METRICS_ENABLED !== "true"
    )
      return null;
    const claim = await ctx.runMutation(internal.visitorping.claim, {});
    if (!claim) return null;
    try {
      const args = { ...claim, apiKey, siteId };
      const impressions = await readVisitorPingTotals({
        ...args,
        event: "wall_impression",
      });
      const clicks = await readVisitorPingTotals({
        ...args,
        event: "wall_owner_link_click",
      });
      await ctx.runMutation(internal.visitorping.finish, {
        attempt: claim.attempt,
        snapshot: {
          takeoverId: claim.takeoverId,
          from: claim.from,
          to: claim.to,
          fetchedAt: Date.now(),
          impressions: impressions.events,
          uniqueVisitors: impressions.uniqueVisitors,
          clicks: clicks.events,
        },
      });
    } catch (error) {
      await ctx.runMutation(internal.visitorping.finish, {
        attempt: claim.attempt,
        error:
          error instanceof VisitorPingReadError
            ? error.message
            : "VisitorPing unavailable or invalid response",
        retryAfterMs:
          error instanceof VisitorPingReadError ? error.retryAfterMs : 60_000,
      });
    }
    return null;
  },
});
