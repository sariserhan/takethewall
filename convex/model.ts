import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { jobKind } from "./schema";
export const publicOwner = v.object({
  id: v.id("takeovers"),
  websiteUrl: v.string(),
  domain: v.string(),
  description: v.string(),
  logoUrl: v.union(v.string(), v.null()),
  activatedAt: v.number(),
  activationSequence: v.number(),
  impressions: v.number(),
  uniqueVisitors: v.number(),
  clicks: v.number(),
  kind: v.string(),
});
export async function projectOwner(ctx: QueryCtx, t: Doc<"takeovers">) {
  return {
    id: t._id,
    websiteUrl: t.websiteUrl,
    domain: t.domain,
    description: t.description,
    logoUrl: await ctx.storage.getUrl(t.logoStorageId),
    activatedAt: t.activatedAt ?? 0,
    activationSequence: t.activationSequence ?? 0,
    impressions: t.impressions,
    uniqueVisitors: t.uniqueVisitors,
    clicks: t.clicks,
    kind: t.kind,
  };
}
export async function getSite(ctx: QueryCtx) {
  const site = await ctx.db
    .query("siteStats")
    .withIndex("by_key", (q) => q.eq("key", "wall"))
    .unique();
  if (!site) throw new Error("Wall is not initialized.");
  return site;
}
export async function daily(
  ctx: MutationCtx,
  date = new Date().toISOString().slice(0, 10),
) {
  let d = await ctx.db
    .query("dailyStats")
    .withIndex("by_date", (q) => q.eq("date", date))
    .unique();
  if (!d) {
    const id = await ctx.db.insert("dailyStats", {
      date,
      visitors: 0,
      impressions: 0,
      clicks: 0,
      takeovers: 0,
    });
    d = (await ctx.db.get(id))!;
  }
  return d;
}
export async function limit(
  ctx: MutationCtx,
  key: string,
  max: number,
  windowMs = 60_000,
) {
  const now = Date.now();
  const row = await ctx.db
    .query("limits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row && row.expiresAt > now) {
    if (row.count >= max)
      throw new Error("Too many requests. Try again later.");
    await ctx.db.patch(row._id, { count: row.count + 1 });
  } else if (row)
    await ctx.db.patch(row._id, { count: 1, expiresAt: now + windowMs });
  else
    await ctx.db.insert("limits", { key, count: 1, expiresAt: now + windowMs });
}
export async function receipt(ctx: MutationCtx, key: string) {
  if (
    await ctx.db
      .query("receipts")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()
  )
    return false;
  await ctx.db.insert("receipts", {
    key,
    expiresAt: Date.now() + 48 * 3600_000,
  });
  return true;
}
export async function enqueue(
  ctx: MutationCtx,
  kind: typeof jobKind.type,
  takeoverId: Id<"takeovers">,
  suffix = "",
  visitor?: { visitorHash: string; pageId: string; region: string },
) {
  const key = `${kind}:${takeoverId}:${suffix}`;
  if (
    await ctx.db
      .query("jobs")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()
  )
    return;
  await ctx.db.insert("jobs", {
    key,
    kind,
    takeoverId,
    deliveryId: crypto.randomUUID(),
    ...(visitor ?? {}),
    timestamp: Date.now(),
    state: "pending",
    attempts: 0,
    nextAt: Date.now(),
  });
}
export const zeros = { impressions: 0, uniqueVisitors: 0, clicks: 0 };
