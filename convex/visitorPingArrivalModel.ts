import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { MutationCtx } from "./_generated/server";
import type { VisitorPingAlert } from "../lib/visitorping-webhook";
import { daily, getSite } from "./model";
import { historicalViews } from "./visitTotals";
import { createVisit, regionDelta } from "./visitLedger";
import { applyCityDelta } from "./radarCityModel";
import { recordReferral } from "./growth";
import { syncHall } from "./hallModel";

function hash(value: string) { return bytesToHex(sha256(new TextEncoder().encode(value))); }
export function arrivalKey(data: VisitorPingAlert["data"]) {
  return data.sessionId ? `session:${data.sessionId}` : `legacy:${hash(JSON.stringify([data.timestamp ?? "", data.siteDomain, data.entryPage, data.location.city, data.location.region, data.location.country, data.source, data.deviceType, data.referralPublicId ?? ""]))}`;
}
async function totals(ctx: MutationCtx, takeoverId: Parameters<typeof regionDelta>[1], date: string, delta: number) {
  const site = await getSite(ctx), day = await daily(ctx, date), owner = await ctx.db.get(takeoverId);
  if (!owner) throw Error("Arrival owner missing");
  await ctx.db.patch(site._id, { totalViews: (site.totalViews ?? await historicalViews(ctx)) + delta, updatedAt: Date.now() });
  await ctx.db.patch(day._id, { impressions: day.impressions + delta });
  await ctx.db.patch(owner._id, { impressions: owner.impressions + delta });
}
async function removeReferral(ctx: MutationCtx, publicId: string, visitorHash: string) {
  const owner = await ctx.db.query("takeovers").withIndex("by_publicId", q => q.eq("publicTakeoverId", publicId)).unique();
  if (!owner) return;
  const visit = await ctx.db.query("referralVisits").withIndex("by_source_visitor", q => q.eq("takeoverId", owner._id).eq("visitorHash", visitorHash)).unique();
  if (!visit) return;
  await ctx.db.delete(visit._id);
  await ctx.db.patch(owner._id, { shareVisitors: Math.max(0, (owner.shareVisitors ?? 0) - 1) });
  await syncHall(ctx, owner._id);
}

// Arrival alerts represent a session, not another impression when the browser
// has already reported that same session. Keep unmatched arrivals reversible.
export async function recordArrival(ctx: MutationCtx, alert: VisitorPingAlert, receivedAt: number) {
  if (process.env.PUBLIC_METRICS_ENABLED !== "true" || alert.event !== "visitor.arrival") return;
  const data = alert.data;
  // Older real-browser alerts have no join key: do not double-count existing
  // Vercel impressions. Admin-sent events have no browser counterpart.
  if (!data.sessionId && data.source !== "Visitorping Admin") return;
  let page: URL;
  try { page = new URL(data.entryPage); } catch { return; }
  if (!["takethewall.com", "www.takethewall.com"].includes(page.hostname) || page.pathname !== "/") return;
  const occurredAt = data.timestamp ? Date.parse(data.timestamp) : receivedAt;
  if (!Number.isFinite(occurredAt) || occurredAt > Date.now() + 300_000 || occurredAt < Date.now() - 7 * 86400_000) return;
  const key = arrivalKey(data);
  let session = await ctx.db.query("visitorPingSessions").withIndex("by_key", q => q.eq("key", key)).unique();
  if (session?.excluded) return;
  const visitorHash = hash(`visitorping:${data.visitorId ?? key}`);
  if (!session) {
    const id = await ctx.db.insert("visitorPingSessions", { key, visitorHash, matched: false, excluded: false });
    session = (await ctx.db.get(id))!;
  }
  if (data.referralPublicId) {
    const identity = await ctx.db.query("visitorPingIdentities").withIndex("by_key", q => q.eq("key", session.visitorHash)).unique();
    await recordReferral(ctx, { publicId: data.referralPublicId, visitorHash: identity?.referralHash ?? session.visitorHash, ownerTokenHash: identity?.ownerTokenHash });
    await ctx.db.patch(session._id, { referralPublicId: data.referralPublicId });
  }
  if (session.matched || session.fallbackVisitId) return;
  const owner = await ctx.db.query("takeovers").withIndex("by_activatedAt", q => q.lte("activatedAt", occurredAt)).order("desc").first();
  if (!owner?.activatedAt || (owner.replacedAt !== undefined && occurredAt > owner.replacedAt)) return;
  const date = new Date(occurredAt).toISOString().slice(0, 10);
  const country = /^[A-Z]{2}$/.test(data.location.country.toUpperCase()) ? data.location.country.toUpperCase() : "ZZ";
  const id = await createVisit(ctx, { key: `arrival:${key}`, takeoverId: owner._id, visitorHash: session.visitorHash, occurredAt, freshReign: false, region: country, city: data.location.city, source: "visitorping" });
  await ctx.db.patch(id, { cityBackfilled: true });
  await applyCityDelta(ctx, date, { city: data.location.city, country, views: 1 });
  await totals(ctx, owner._id, date, 1);
  await ctx.db.patch(session._id, { fallbackVisitId: id });
}

export async function matchArrival(ctx: MutationCtx, a: { providerSessionId?: string; providerVisitorId?: string; excluded: boolean; referral?: { publicId: string; visitorHash: string; ownerTokenHash?: string } }) {
  if (!a.providerSessionId) return;
  const key = `session:${a.providerSessionId}`;
  let session = await ctx.db.query("visitorPingSessions").withIndex("by_key", q => q.eq("key", key)).unique();
  if (!session) {
    const id = await ctx.db.insert("visitorPingSessions", { key, visitorHash: hash(`visitorping:${a.providerVisitorId ?? key}`), matched: true, excluded: a.excluded });
    session = (await ctx.db.get(id))!;
  }
  if (session.fallbackVisitId) {
    const visit = await ctx.db.get(session.fallbackVisitId);
    if (visit) {
      await ctx.db.delete(visit._id);
      await regionDelta(ctx, visit.takeoverId, visit.country, -1, 0);
      await applyCityDelta(ctx, visit.date, { city: visit.city, country: visit.country, views: -1 });
      await totals(ctx, visit.takeoverId, visit.date, -1);
      const radar = await ctx.db.query("radarVisitors").withIndex("by_date_visitorHash", q => q.eq("date", visit.date).eq("visitorHash", visit.visitorHash)).unique();
      if (radar?.lastVisitKey === visit.key) await ctx.db.delete(radar._id);
    }
  }
  if (session.referralPublicId && (a.referral || a.excluded)) await removeReferral(ctx, session.referralPublicId, session.visitorHash);
  if (a.referral && !a.excluded) {
    const identity = await ctx.db.query("visitorPingIdentities").withIndex("by_key", q => q.eq("key", session.visitorHash)).unique();
    const values = { referralHash: a.referral.visitorHash, ownerTokenHash: a.referral.ownerTokenHash };
    if (identity) await ctx.db.patch(identity._id, values);
    else await ctx.db.insert("visitorPingIdentities", { key: session.visitorHash, ...values });
    await recordReferral(ctx, a.referral);
  }
  await ctx.db.patch(session._id, { matched: true, excluded: a.excluded, fallbackVisitId: undefined });
}
