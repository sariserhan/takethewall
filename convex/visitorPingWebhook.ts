import { recordArrival } from "./visitorPingArrivalModel";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { visitorPingAlert } from "./visitorPingWebhookModel";
import { parseVisitorPingAlert } from "../lib/visitorping-webhook";
import { limit } from "./model";
export const receive = internalMutation({
  args: { payload: visitorPingAlert },
  returns: v.null(),
  handler: async (ctx, { payload }) => {
    const alert = parseVisitorPingAlert(payload);
    await limit(ctx, "visitorping:webhook", 600);
    await ctx.db.insert("visitorPingWebhookDeliveries", {
      ...alert,
      receivedAt: Date.now(),
    });
    await recordArrival(ctx, alert, Date.now());
    return null;
  },
});
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("visitorPingWebhookDeliveries")
      .withIndex("by_receivedAt", (q) =>
        q.lt("receivedAt", Date.now() - 90 * 86400_000),
      )
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100)
      await ctx.scheduler.runAfter(0, internal.visitorPingWebhook.cleanup, {});
    return null;
  },
});

// Only user-authorized coarse city/country are public; region and other fields stay private.
export const radar = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("visitorPingWebhookDeliveries"),
      receivedAt: v.number(),
      city: v.string(),
      country: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("visitorPingWebhookDeliveries")
      .withIndex("by_event_receivedAt", (q) => q.eq("event", "visitor.arrival"))
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      id: row._id,
      receivedAt: row.receivedAt,
      city: row.data.location.city,
      country: row.data.location.country,
    }));
  },
});

// Explicit one-time replay; recurring ingestion remains webhook-only.
export const replay = internalMutation({
  args: { ids: v.array(v.id("visitorPingWebhookDeliveries")) }, returns: v.null(),
  handler: async (ctx, { ids }) => {
    if (ids.length > 50) throw Error("Replay at most 50 arrivals");
    for (const id of ids) {
      const row = await ctx.db.get(id);
      if (row) await recordArrival(ctx, row, row.receivedAt);
    }
    return null;
  },
});
