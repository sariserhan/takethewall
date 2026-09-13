import { projectDesignImages, publicDesignImages } from "./designAssets";
import { scheduleDelivery } from "./deliverySchedule";
import { numberingOffset } from "./numbering";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { jobKind } from "./schema";
export const publicOwner = v.object({
  id: v.id("takeovers"),
  contentType: v.string(),
  linkType: v.string(),
  displayName: v.string(),
  takeoverNumber: v.union(v.number(), v.null()),
  outboundLinkEnabled: v.boolean(),
  websiteUrl: v.string(),
  domain: v.string(),
  description: v.string(),
  morseMessage: v.optional(v.string()),
  canvasDesign: v.optional(v.string()),
  canvasLinksEnabled: v.optional(v.boolean()),
  canvasImages: v.optional(publicDesignImages),
  logoUrl: v.union(v.string(), v.null()),
  activatedAt: v.number(),
  activationSequence: v.number(),
  impressions: v.number(),
  uniqueVisitors: v.number(),
  clicks: v.number(),
  shareVisitors: v.optional(v.number()),
  kind: v.string(),
});
export async function projectOwner(ctx: QueryCtx, t: Doc<"takeovers">) {
  return {
    id: t._id,
    contentType: t.contentType ?? "link",
    linkType: t.linkType ?? "website",
    displayName: t.displayName ?? t.domain,
    takeoverNumber:
      t.takeoverNumber === undefined
        ? null
        : t.takeoverNumber + (await numberingOffset(ctx)),
    outboundLinkEnabled:
      t.outboundLinkEnabled !== false && t.contentType !== "personal",
    websiteUrl: t.websiteUrl,
    domain: t.domain,
    description: t.description,
    ...(t.canvasDesign ? { canvasDesign: t.canvasDesign, canvasLinksEnabled: t.outboundLinkEnabled !== false, canvasImages: [...await projectDesignImages(ctx,t.canvasAssets), ...(t.logoStorageId ? [{key:"logo",url:(await ctx.storage.getUrl(t.logoStorageId)) ?? ""}] : [])] } : {}),
    ...(t.morseMessage ? { morseMessage: t.morseMessage } : {}),
    logoUrl: t.logoStorageId ? await ctx.storage.getUrl(t.logoStorageId) : null,
    activatedAt: t.activatedAt ?? 0,
    activationSequence: t.activationSequence ?? 0,
    impressions: t.impressions,
    uniqueVisitors: t.uniqueVisitors,
    clicks: t.clicks,
    shareVisitors: t.shareVisitors ?? 0,
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
  const deliveryId = await ctx.db.insert("jobs", {
    key,
    kind,
    takeoverId,
    deliveryId: crypto.randomUUID(),
    ...(visitor ?? {}),
    timestamp: Date.now(),
    state: "pending",
    attempts: 0,
    nextAt: Date.now() + (kind === "replacement_email" ? 150_001 : 0),
  });
  await scheduleDelivery(
    ctx,
    "jobs",
    deliveryId,
    Date.now() + (kind === "replacement_email" ? 150_001 : 0),
  );
}
export const zeros = { impressions: 0, uniqueVisitors: 0, clicks: 0 };

// Resolve the actual preceding activation, never public demo overrides.
export async function previousOwnerName(
  ctx: QueryCtx,
  takeover: Doc<"takeovers">,
) {
  if (!takeover.activationSequence) return null;
  const previous = await ctx.db
    .query("takeovers")
    .withIndex("by_activationSequence", (q) =>
      q.eq("activationSequence", takeover.activationSequence! - 1),
    )
    .unique();
  if (!previous) return null;
  if (previous.blocked || previous.status === "rejected")
    return "Removed placement";
  return previous.displayName || previous.domain || "House placement";
}
