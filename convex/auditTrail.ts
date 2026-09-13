import { numberingOffset } from "./numbering";
import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auditHash } from "../lib/audit";
export const migrate = internalMutation({
  args: {},
  returns: v.object({ done: v.boolean(), paidNumbers: v.number() }),
  handler: async (ctx) => {
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    if (!site) return { done: true, paidNumbers: 0 };
    if (site.auditHash && !site.auditMigrationCursor)
      return { done: true, paidNumbers: site.totalTakeovers };
    const rows = await ctx.db
      .query("takeovers")
      .withIndex("by_activationSequence", (q) =>
        q.gt("activationSequence", site.auditMigrationCursor ?? -1),
      )
      .take(100);
    let number = site.auditMigrationNumber ?? 0,
      previous = site.auditMigrationHash ?? "",
      cursor = site.auditMigrationCursor ?? -1;
    for (const t of rows) {
      cursor = t.activationSequence ?? cursor;
      if ((t.kind !== "paid" && t.kind !== "admin_counted") || !t.activatedAt)
        continue;
      const p = await ctx.db
        .query("purchases")
        .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
        .unique();
      if (!p?.paidAt && !p?.issuedAt) continue;
      number++;
      const publicTakeoverId =
        t.publicTakeoverId ?? "ttw_" + crypto.randomUUID().replaceAll("-", "");
      const content = t.originalContent ?? t;
      const payload = {
        takeoverNumber: number,
        publicTakeoverId,
        activatedAt: t.activatedAt,
        amountCents: p.amountCents!,
        currency: p.currency!,
        contentHash: auditHash({
          type: content.contentType ?? "link",
          linkType: content.linkType ?? "website",
          destinationUrl: content.websiteUrl,
          displayName: content.displayName ?? content.domain,
          description: content.description,
          ...(content?.morseMessage ? { morseMessage: content.morseMessage } : {}),
          ...(content?.canvasDesign ? {canvasDesign:content.canvasDesign,canvasAssets:("canvasAssets" in content ? content.canvasAssets : []) ?? []} : {}),
          imageStorageId: content.logoStorageId ?? null,
        }),
        previousAuditHash: previous,
      };
      const hash = auditHash(payload);
      const existing = await ctx.db
        .query("takeoverAudit")
        .withIndex("by_number", (q) => q.eq("takeoverNumber", number))
        .unique();
      if (existing && existing.auditHash !== hash)
        throw new Error(
          "Existing audit mismatch; investigate before migration",
        );
      if (!existing)
        await ctx.db.insert("takeoverAudit", {
          ...payload,
          takeoverId: t._id,
          auditHash: hash,
        });
      await ctx.db.patch(t._id, {
        takeoverNumber: number,
        publicTakeoverId,
        previousAuditHash: previous,
        auditHash: hash,
      });
      previous = hash;
    }
    const done = rows.length < 100;
    if (done) {
      if (number !== site.totalTakeovers)
        throw new Error("Paid count differs from authoritative history");
      await ctx.db.patch(site._id, {
        auditHash: previous || undefined,
        auditMigrationCursor: undefined,
        auditMigrationNumber: undefined,
        auditMigrationHash: undefined,
      });
    } else
      await ctx.db.patch(site._id, {
        auditMigrationCursor: cursor,
        auditMigrationNumber: number,
        auditMigrationHash: previous,
      });
    return { done, paidNumbers: number };
  },
});
const entry = v.object({
  takeoverNumber: v.number(),
  publicTakeoverId: v.string(),
  activatedAt: v.number(),
  amountCents: v.number(),
  currency: v.string(),
  contentHash: v.string(),
  previousAuditHash: v.string(),
  auditHash: v.string(),
});
export const entries = query({
  args: { after: v.optional(v.number()) },
  returns: v.object({
    entries: v.array(entry),
    numberingOffset: v.optional(v.number()),
    next: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, a) => {
    const rows = await ctx.db
      .query("takeoverAudit")
      .withIndex("by_number", (q) => q.gt("takeoverNumber", a.after ?? 0))
      .take(100);
    const offset = await numberingOffset(ctx);
    return {
      ...(offset ? { numberingOffset: offset } : {}),
      entries: rows.map((r) => ({
        takeoverNumber: r.takeoverNumber,
        publicTakeoverId: r.publicTakeoverId,
        activatedAt: r.activatedAt,
        amountCents: r.amountCents,
        currency: r.currency,
        contentHash: r.contentHash,
        previousAuditHash: r.previousAuditHash,
        auditHash: r.auditHash,
      })),
      next: rows.length === 100 ? rows.at(-1)!.takeoverNumber : null,
    };
  },
});
export const verify = query({
  args: { after: v.optional(v.number()) },
  returns: v.object({
    valid: v.boolean(),
    next: v.union(v.number(), v.null()),
    reason: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, a) => {
    const after = a.after ?? 0;
    const previous = after
      ? await ctx.db
          .query("takeoverAudit")
          .withIndex("by_number", (q) => q.eq("takeoverNumber", after))
          .unique()
      : null;
    let head = previous?.auditHash ?? "",
      number = after;
    if (after && !previous)
      return { valid: false, next: null, reason: "Missing starting record" };
    const rows = await ctx.db
      .query("takeoverAudit")
      .withIndex("by_number", (q) => q.gt("takeoverNumber", after))
      .take(100);
    for (const r of rows) {
      const { _id, _creationTime, takeoverId, auditHash: hash, ...payload } = r;
      void _id;
      void _creationTime;
      const t = await ctx.db.get(takeoverId);
      const content = t?.originalContent ?? t;
      if (
        r.takeoverNumber !== ++number ||
        r.previousAuditHash !== head ||
        auditHash(payload) !== hash ||
        t?.auditHash !== hash ||
        t.takeoverNumber !== r.takeoverNumber ||
        auditHash({
          type: content?.contentType ?? "link",
          linkType: content?.linkType ?? "website",
          destinationUrl: content?.websiteUrl,
          displayName: content?.displayName ?? content?.domain,
          description: content?.description,
          ...(content?.morseMessage ? { morseMessage: content.morseMessage } : {}),
          ...(content?.canvasDesign ? {canvasDesign:content.canvasDesign,canvasAssets:("canvasAssets" in content ? content.canvasAssets : []) ?? []} : {}),
          imageStorageId: content?.logoStorageId ?? null,
        }) !== r.contentHash
      )
        return {
          valid: false,
          next: null,
          reason: `Audit mismatch at #${r.takeoverNumber}`,
        };
      head = hash;
    }
    return {
      valid: true,
      next: rows.length === 100 ? number : null,
      reason: null,
    };
  },
});
export const checkpoint = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const last = await ctx.db
      .query("auditCheckpoints")
      .withIndex("by_to")
      .order("desc")
      .first();
    const head = await ctx.db
      .query("takeoverAudit")
      .withIndex("by_number")
      .order("desc")
      .first();
    if (!head || last?.toNumber === head.takeoverNumber) return null;
    if (
      head.takeoverNumber - (last?.toNumber ?? 0) < 100 &&
      Date.now() - (last?.createdAt ?? head.activatedAt) < 86400_000
    )
      return null;
    await ctx.db.insert("auditCheckpoints", {
      fromNumber: (last?.toNumber ?? 0) + 1,
      toNumber: head.takeoverNumber,
      finalHash: head.auditHash,
      createdAt: Date.now(),
      state: "pending",
      nextAt: Date.now(),
      attempts: 0,
    });
    return null;
  },
});
export const checkpoints = query({
  args: {},
  returns: v.array(
    v.object({
      fromNumber: v.number(),
      toNumber: v.number(),
      finalHash: v.string(),
      createdAt: v.number(),
      state: v.string(),
      proofUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("auditCheckpoints")
      .withIndex("by_to")
      .order("desc")
      .take(100);
    return Promise.all(
      rows.map(async (r) => ({
        fromNumber: r.fromNumber,
        toNumber: r.toNumber,
        finalHash: r.finalHash,
        createdAt: r.createdAt,
        state: r.state,
        proofUrl: r.proofStorageId
          ? await ctx.storage.getUrl(r.proofStorageId)
          : null,
      })),
    );
  },
});

export const current = query({
  args: {},
  returns: v.union(v.null(), v.object({ publicId: v.union(v.string(), v.null()), hash: v.union(v.string(), v.null()), previousHash: v.union(v.string(), v.null()), activatedAt: v.union(v.number(), v.null()), sequence: v.union(v.number(), v.null()) })),
  handler: async ctx => {
    const site = await ctx.db.query("siteStats").withIndex("by_key", q => q.eq("key", "wall")).unique();
    const t = site ? await ctx.db.get(site.currentTakeoverId) : null;
    if (!t || t.blocked || t.status !== "active") return null;
    return { publicId: t.publicTakeoverId ?? null, hash: t.auditHash ?? null, previousHash: t.previousAuditHash ?? null, activatedAt: t.activatedAt ?? null, sequence: t.activationSequence ?? null };
  },
});
