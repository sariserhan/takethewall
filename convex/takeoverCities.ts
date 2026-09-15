import { v } from "convex/values";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { addCityDelta, cityKey, cityName, type CityDelta } from "./radarCityModel";

export async function applyTakeoverCity(ctx: MutationCtx, takeoverId: Id<"takeovers">, city: string, country: string, views: number) {
  const key = cityKey(city, country);
  const row = await ctx.db.query("takeoverCityViews").withIndex("by_takeoverId_key", q => q.eq("takeoverId", takeoverId).eq("key", key)).unique();
  const latest = await ctx.db.query("visitLedger").withIndex("by_takeoverId_cityKey_occurredAt", q => q.eq("takeoverId", takeoverId).eq("cityKey", key)).order("desc").first();
  const values = { views: (row?.views ?? 0) + views, lastVisitAt: latest?.occurredAt ?? 0 };
  if (row) await ctx.db.patch(row._id, values);
  else await ctx.db.insert("takeoverCityViews", { takeoverId, key, city: cityName(city), country, ...values });
}
export async function trackTakeoverCity(ctx: MutationCtx, visitId: Id<"visitLedger">) {
  const visit = await ctx.db.get(visitId);
  if (!visit || visit.takeoverCityRecorded) return;
  const snapshot = await ctx.db.query("takeoverCitySnapshots").withIndex("by_takeoverId", q => q.eq("takeoverId", visit.takeoverId)).unique();
  if (snapshot && visit.occurredAt <= snapshot.through && !visit.key.startsWith("arrival:")) {
    // The snapshot owns the count; retained ledger rows still supply recency.
    await applyTakeoverCity(ctx, visit.takeoverId, visit.city, visit.country, 0);
    return;
  }
  await applyTakeoverCity(ctx, visit.takeoverId, visit.city, visit.country, 1);
  await ctx.db.patch(visit._id, { takeoverCityRecorded: true });
}
export async function readTakeoverCities(ctx: QueryCtx, takeoverId: Id<"takeovers">, views: number, uniqueVisitors: number) {
  const rows = await ctx.db.query("takeoverCityViews").withIndex("by_takeoverId_key", q => q.eq("takeoverId", takeoverId)).take(500);
  const snapshot = await ctx.db.query("takeoverCitySnapshots").withIndex("by_takeoverId", q => q.eq("takeoverId", takeoverId)).unique();
  const groups: CityDelta[] = [];
  for (const row of snapshot?.cities ?? []) addCityDelta(groups, row.city, row.country, row.views);
  for (const row of rows) if (row.views >= 0) addCityDelta(groups, row.city, row.country, row.views, row.lastVisitAt);
  // Pending analytics batches can briefly precede the published view counter.
  // Include only that counter's views until its transaction catches up.
  let remaining = views;
  const cities = groups.sort((a,b) => (b.lastVisitAt ?? 0) - (a.lastVisitAt ?? 0) || a.city.localeCompare(b.city)).flatMap(row => {
    const count = Math.min(Math.max(0, row.views), remaining); remaining -= count;
    return count ? [{ city: row.city, country: row.country, views: count, label: row.city ? `${row.city}, ${row.country}` : "Location not recorded" }] : [];
  });
  if (remaining > 0) cities.push({ city: "", country: "ZZ", views: remaining, label: "Location not recorded" });
  return { date: "takeover", views, uniqueVisitors, historicalThrough: snapshot ? new Date(snapshot.through).toISOString() : null, cities };
}
export const backfill = internalMutation({
  args: { takeoverId: v.id("takeovers"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ done: v.boolean(), cursor: v.string() }),
  handler: async (ctx, { takeoverId, cursor }) => {
    const page = await ctx.db.query("visitLedger").withIndex("by_takeoverId_cityKey_occurredAt", q => q.eq("takeoverId", takeoverId)).paginate({ cursor, numItems: 100 });
    for (const visit of page.page) await trackTakeoverCity(ctx, visit._id);
    return { done: page.isDone, cursor: page.continueCursor };
  },
});
export const importSnapshot = internalMutation({
  args: { takeoverId: v.id("takeovers"), through: v.number(), cities: v.array(v.object({ city: v.string(), country: v.string(), views: v.number() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.takeoverId);
    if (!owner?.activatedAt || args.through < owner.activatedAt || args.through > Date.now() || args.cities.length > 500 || args.cities.some(c => !Number.isSafeInteger(c.views) || c.views < 0) || args.cities.reduce((n,c) => n+c.views,0) > owner.impressions) throw Error("Invalid city snapshot");
    const old = await ctx.db.query("takeoverCitySnapshots").withIndex("by_takeoverId", q => q.eq("takeoverId", args.takeoverId)).unique();
    if (old) { if (old.through === args.through) return null; throw Error("Snapshot already imported"); }
    const visits = await ctx.db.query("visitLedger").withIndex("by_takeoverId_cityKey_occurredAt", q => q.eq("takeoverId", args.takeoverId)).take(501);
    if (visits.length === 501) throw Error("Snapshot needs a paginated migration");
    for (const visit of visits) if (visit.occurredAt <= args.through && visit.takeoverCityRecorded && !visit.key.startsWith("arrival:")) {
      await applyTakeoverCity(ctx, visit.takeoverId, visit.city, visit.country, -1);
      await ctx.db.patch(visit._id, { takeoverCityRecorded: false });
    }
    await ctx.db.insert("takeoverCitySnapshots", args);
    return null;
  },
});
