import { v } from "convex/values";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

type Location = { region: string; city?: string; source?: "vercel" | "visitorping" };
export function visitLocation(a: Location) {
  return { country: /^[A-Z]{2}$/.test(a.region) ? a.region : "ZZ", city: (a.city ?? "").trim().slice(0, 160), source: a.source ?? "vercel" as const };
}
async function regionDelta(ctx: MutationCtx, takeoverId: Id<"takeovers">, country: string, impressions: number, uniqueVisitors: number) {
  const row = await ctx.db.query("takeoverRegions").withIndex("by_takeoverId_regionCode", q => q.eq("takeoverId", takeoverId).eq("regionCode", country)).unique();
  if (row) await ctx.db.patch(row._id, { impressions: row.impressions + impressions, uniqueVisitors: row.uniqueVisitors + uniqueVisitors });
  else await ctx.db.insert("takeoverRegions", { takeoverId, regionCode: country, impressions, uniqueVisitors });
}
async function updateRadar(ctx: MutationCtx, visit: Omit<Doc<"visitLedger">, "_id" | "_creationTime">) {
  const row = await ctx.db.query("radarVisitors").withIndex("by_date_visitorHash", q => q.eq("date", visit.date).eq("visitorHash", visit.visitorHash)).unique();
  const location = { city: visit.city, country: visit.country };
  if (!row) await ctx.db.insert("radarVisitors", { date: visit.date, visitorHash: visit.visitorHash, firstSeenAt: visit.occurredAt, lastSeenAt: visit.occurredAt, lastVisitKey: visit.key, ...location });
  else if (visit.occurredAt > row.lastSeenAt || visit.key === row.lastVisitKey) await ctx.db.patch(row._id, { lastSeenAt: visit.occurredAt, lastVisitKey: visit.key, ...location });
}
export async function createVisit(ctx: MutationCtx, a: Location & { key: string; takeoverId: Id<"takeovers">; visitorHash: string; occurredAt: number; freshReign: boolean }) {
  const { country, city, source } = visitLocation(a);
  const visit = { key: a.key, takeoverId: a.takeoverId, visitorHash: a.visitorHash, occurredAt: a.occurredAt, date: new Date(a.occurredAt).toISOString().slice(0, 10), country, city, locationSource: source, sources: [source], freshReign: a.freshReign };
  await ctx.db.insert("visitLedger", visit);
  await regionDelta(ctx, a.takeoverId, country, 1, Number(a.freshReign));
  await updateRadar(ctx, visit);
}
export async function enrichVisit(ctx: MutationCtx, row: Doc<"visitLedger">, a: Location & { visitorHash: string }) {
  if (row.visitorHash !== a.visitorHash) throw Error("Visit identity mismatch");
  const incoming = visitLocation(a);
  // VisitorPing's geographic record wins when present; never overwrite it with a later Vercel retry.
  const prefer = incoming.country !== "ZZ" && (row.country === "ZZ" || (incoming.source === "visitorping" && row.locationSource !== "visitorping"));
  const country = prefer ? incoming.country : row.country;
  const city = prefer ? (incoming.city || (country === row.country ? row.city : "")) : row.city || (incoming.country === country ? incoming.city : "");
  const changes = { country, city, locationSource: prefer ? incoming.source : row.locationSource, sources: [...new Set([...row.sources, incoming.source])] };
  if (country !== row.country) {
    await regionDelta(ctx, row.takeoverId, row.country, -1, -Number(row.freshReign));
    await regionDelta(ctx, row.takeoverId, country, 1, Number(row.freshReign));
  }
  await ctx.db.patch(row._id, changes);
  await updateRadar(ctx, { ...row, ...changes });
}
export const radar = query({
  args: { date: v.string() },
  returns: v.array(v.object({ id: v.id("radarVisitors"), receivedAt: v.number(), city: v.string(), country: v.string() })),
  handler: async (ctx, { date }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date !== new Date().toISOString().slice(0, 10)) return [];
    const rows = await ctx.db.query("radarVisitors").withIndex("by_date_lastSeenAt", q => q.eq("date", date)).order("desc").take(50);
    return rows.map(row => ({ id: row._id, receivedAt: row.firstSeenAt, city: row.city, country: row.country }));
  },
});
export const cleanup = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const visits = await ctx.db.query("visitLedger").withIndex("by_date", q => q.lt("date", cutoff)).take(100);
    const visitors = await ctx.db.query("radarVisitors").withIndex("by_date_lastSeenAt", q => q.lt("date", cutoff)).take(100);
    for (const row of [...visits, ...visitors]) await ctx.db.delete(row._id);
    if (visits.length === 100 || visitors.length === 100) await ctx.scheduler.runAfter(0, internal.visitLedger.cleanup, {});
    return null;
  },
});

// Reconstruct identities from the daily counter, never from city/time guesses.
export const backfillRadar = internalMutation({
  args: { date: v.string(), cursor: v.optional(v.string()), dryRun: v.optional(v.boolean()) },
  returns: v.object({ inserted: v.number(), existing: v.number(), done: v.boolean(), cursor: v.string() }),
  handler: async (ctx, { date, cursor, dryRun = false }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > new Date().toISOString().slice(0, 10)) throw Error("Invalid backfill date");
    const page = await ctx.db.query("dailyVisitors").withIndex("by_date_visitorHash", q => q.eq("date", date)).paginate({ cursor: cursor ?? null, numItems: 100 });
    let inserted = 0, existing = 0;
    for (const visitor of page.page) {
      const row = await ctx.db.query("radarVisitors").withIndex("by_date_visitorHash", q => q.eq("date", date).eq("visitorHash", visitor.visitorHash)).unique();
      if (row) { existing++; continue; }
      inserted++;
      if (!dryRun) await ctx.db.insert("radarVisitors", {
        date, visitorHash: visitor.visitorHash,
        firstSeenAt: visitor._creationTime, lastSeenAt: visitor._creationTime,
        lastVisitKey: `historical:${visitor._id}`, country: "ZZ", city: "",
      });
    }
    return { inserted, existing, done: page.isDone, cursor: page.continueCursor };
  },
});
