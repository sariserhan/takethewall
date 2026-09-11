import {
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { enqueue, getSite, zeros } from "./model";
export const recent = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("takeovers"),
      domain: v.string(),
      status: v.string(),
      kind: v.string(),
      sessionId: v.union(v.string(), v.null()),
      paymentIntentId: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("takeovers")
      .withIndex("by_activationSequence")
      .order("desc")
      .take(30);
    return Promise.all(
      rows.map(async (t) => {
        const p = await ctx.db
          .query("purchases")
          .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
          .unique();
        return {
          id: t._id,
          domain: t.domain,
          status: t.status,
          kind: t.kind,
          sessionId: p?.sessionId ?? null,
          paymentIntentId: p?.paymentIntentId ?? null,
        };
      }),
    );
  },
});
export const disable = internalMutation({
  args: {
    expectedCurrentId: v.id("takeovers"),
    reason: v.string(),
    operatorReference: v.string(),
  },
  returns: v.id("takeovers"),
  handler: disableCurrent,
});
export async function disableCurrent(
  ctx: import("./_generated/server").MutationCtx,
  a: {
    expectedCurrentId: Id<"takeovers">;
    reason: string;
    operatorReference: string;
  },
) {
  if (
    !a.reason.trim() ||
    a.reason.length > 1000 ||
    !a.operatorReference.trim() ||
    a.operatorReference.length > 200
  )
    throw new Error("A reason and operator reference are required");
  const prior = await ctx.db
    .query("moderation")
    .withIndex("by_operatorReference", (q) =>
      q.eq("operatorReference", a.operatorReference),
    )
    .unique();
  if (prior) {
    if (prior.removedId !== a.expectedCurrentId || prior.reason !== a.reason)
      throw new Error("Operator reference already used");
    return prior.restoredId;
  }
  const s = await getSite(ctx);
  if (s.currentTakeoverId !== a.expectedCurrentId)
    throw new Error("The owner changed; review the current owner first.");
  const removed = (await ctx.db.get(s.currentTakeoverId))!;
  const candidates = await ctx.db
    .query("takeovers")
    .withIndex("by_activationSequence", (q) =>
      q.lt("activationSequence", s.currentActivationSequence),
    )
    .order("desc")
    .take(100);
  let source = candidates.find(
    (t) => !t.blocked && t.status === "replaced" && t.domain !== removed.domain,
  );
  if (!source) {
    const house = await ctx.db
      .query("takeovers")
      .withIndex("by_activationSequence", (q) => q.eq("activationSequence", 0))
      .unique();
    if (!house || house._id === removed._id)
      throw new Error(
        "Provide a safe house creative before removing this owner",
      );
    source = house;
  }
  const now = Date.now();
  await ctx.db.patch(removed._id, {
    status: "replaced",
    blocked: true,
    replacedAt: now,
    endReason: "moderation",
  });
  const restoredId = await ctx.db.insert("takeovers", {
    contentType: source.contentType,
    linkType: source.linkType,
    displayName: source.displayName,
    websiteUrl: source.websiteUrl,
    domain: source.domain,
    description: source.description,
    logoStorageId: source.logoStorageId,
    kind: "moderation_restoration",
    sourceTakeoverId: source._id,
    status: "active",
    blocked: false,
    createdAt: now,
    activatedAt: now,
    activationSequence: s.currentActivationSequence + 1,
    ...zeros,
  });
  await ctx.db.patch(s._id, {
    currentTakeoverId: restoredId,
    currentActivationSequence: s.currentActivationSequence + 1,
    updatedAt: now,
  });
  await ctx.db.insert("moderation", {
    removedId: removed._id,
    restoredId,
    sourceId: source._id,
    reason: a.reason,
    operatorReference: a.operatorReference,
    timestamp: now,
  });
  if (removed.kind === "paid")
    await enqueue(ctx, "replacement_email", removed._id);
  return restoredId;
}

export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    for (const table of ["receipts", "limits", "dailyVisitors"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
        .take(200);
      for (const r of rows) await ctx.db.delete(r._id);
    }
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(100);
    for (const u of uploads) {
      if (u.storageId) {
        const reference = await ctx.db
          .query("takeovers")
          .withIndex("by_logoStorageId", (q) =>
            q.eq("logoStorageId", u.storageId!),
          )
          .first();
        if (!reference) await ctx.storage.delete(u.storageId);
      }
      await ctx.db.delete(u._id);
    }
    // Only remove abandoned creatives when there is no Checkout Session, or
    // Stripe has authoritatively confirmed expiry. Unresolved payments stay reconcilable.
    const abandoned = await ctx.db
      .query("purchases")
      .withIndex("by_cleanupAt", (q) =>
        q.gt("cleanupAt", 0).lt("cleanupAt", now),
      )
      .take(100);
    for (const p of abandoned) {
      if (p.sessionId && !p.expiredConfirmed) continue;
      const t = await ctx.db.get(p.takeoverId);
      if (!t || t.status !== "pending") continue;
      await ctx.db.delete(t._id);
      const other = await ctx.db
        .query("takeovers")
        .withIndex("by_logoStorageId", (q) =>
          q.eq("logoStorageId", t.logoStorageId),
        )
        .first();
      if (!other)
        if (t.logoStorageId) await ctx.storage.delete(t.logoStorageId);
      await ctx.db.delete(p._id);
    }
    const contacts = await ctx.db
      .query("purchases")
      .withIndex("by_contactDeleteAt", (q) => q.lt("contactDeleteAt", now))
      .take(100);
    for (const p of contacts) {
      const t = await ctx.db.get(p.takeoverId);
      if (t?.status === "active") {
        await ctx.db.patch(p._id, { contactDeleteAt: now + 30 * 86400_000 });
        continue;
      }
      await ctx.db.patch(p._id, {
        buyerEmail: "",
        receiptEmail: undefined,
        contactDeleteAt: 8640000000000000,
      });
    }
    const s = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    if (
      s &&
      new Date(s.updatedAt).toISOString().slice(0, 10) !==
        new Date(now).toISOString().slice(0, 10)
    )
      await ctx.db.patch(s._id, { updatedAt: now });
    return null;
  },
});
export const deleteContact = internalMutation({
  args: { purchaseId: v.id("purchases") },
  returns: v.null(),
  handler: async (ctx, a) => {
    await ctx.db.patch(a.purchaseId, {
      buyerEmail: "",
      receiptEmail: undefined,
      contactDeleteAt: 8640000000000000,
    });
    return null;
  },
});

// Deployment-admin tooling only; never exported as a public mutation or HTTP operation.
export const bootstrap = internalAction({
  args: { logoBase64: v.string() },
  returns: v.id("takeovers"),
  handler: async (ctx, a): Promise<Id<"takeovers">> => {
    const bytes = Uint8Array.from(atob(a.logoBase64), (c) => c.charCodeAt(0));
    const logoStorageId = await ctx.storage.store(
      new Blob([bytes], { type: "image/png" }),
    );
    try {
      return await ctx.runMutation(internal.wall.seed, { logoStorageId });
    } catch (e) {
      await ctx.storage.delete(logoStorageId);
      throw e;
    }
  },
});
