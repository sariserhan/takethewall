import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  daily,
  enqueue,
  getSite,
  limit,
  projectOwner,
  publicOwner,
  zeros,
} from "./model";
import {
  validateUrl,
  validateDescription,
  validateEmail,
  validateContent,
} from "../lib/validation";
export const pending = internalMutation({
  args: {
    requestKey: v.string(),
    fingerprint: v.string(),
    tokenHash: v.string(),
    ownerHash: v.string(),
    uploadKey: v.string(),
    websiteUrl: v.string(),
    description: v.string(),
    buyerEmail: v.string(),
    environment: v.union(v.literal("test"), v.literal("production")),
  },
  returns: v.object({
    takeoverId: v.id("takeovers"),
    purchaseId: v.id("purchases"),
    checkoutUrl: v.union(v.string(), v.null()),
    checkoutExpiresAt: v.number(),
  }),
  handler: async (ctx, a) => {
    await limit(ctx, "submit:" + a.ownerHash, 10, 3600_000);
    await limit(ctx, "submit:global", 300, 3600_000);
    const old = await ctx.db
      .query("purchases")
      .withIndex("by_requestKey", (q) => q.eq("requestKey", a.requestKey))
      .unique();
    if (old) {
      if (old.fingerprint !== a.fingerprint)
        throw new Error(
          "This request was already used for a different advertisement.",
        );
      if (old.paidAt || old.checkoutExpiresAt <= Date.now())
        throw new Error(
          "This checkout is complete or expired. Start a new purchase.",
        );
      return {
        takeoverId: old.takeoverId,
        purchaseId: old._id,
        checkoutUrl: old.checkoutUrl ?? null,
        checkoutExpiresAt: old.checkoutExpiresAt,
      };
    }
    await getSite(ctx);
    const url = validateUrl(a.websiteUrl),
      description = validateDescription(a.description),
      buyerEmail = validateEmail(a.buyerEmail);
    validateContent(url.domain, description, process.env.BLOCKED_DOMAINS);
    if (a.environment !== (process.env.WALL_ENVIRONMENT ?? "test"))
      throw new Error("Payment environment mismatch");
    const upload = await ctx.db
      .query("uploads")
      .withIndex("by_key", (q) => q.eq("key", a.uploadKey))
      .unique();
    if (
      !upload?.storageId ||
      upload.ownerHash !== a.ownerHash ||
      upload.expiresAt <= Date.now()
    )
      throw new Error("Upload expired. Choose your logo again.");
    const id = await ctx.db.insert("takeovers", {
      ...url,
      description,
      logoStorageId: upload.storageId,
      kind: "paid",
      status: "pending",
      blocked: false,
      createdAt: Date.now(),
      ...zeros,
    });
    const checkoutExpiresAt =
      Math.floor(Date.now() / 1000) * 1000 + 24 * 3600_000;
    const purchaseId = await ctx.db.insert("purchases", {
      takeoverId: id,
      buyerEmail,
      requestKey: a.requestKey,
      fingerprint: a.fingerprint,
      tokenHash: a.tokenHash,
      tokenExpiresAt: Date.now() + 48 * 3600_000,
      checkoutExpiresAt,
      cleanupAt: checkoutExpiresAt + 48 * 3600_000,
      environment: a.environment,
      createdAt: Date.now(),
      contactDeleteAt: Date.now() + 30 * 86400_000,
    });
    await ctx.db.patch(upload._id, { claimed: true });
    return { takeoverId: id, purchaseId, checkoutUrl: null, checkoutExpiresAt };
  },
});
export const attach = internalMutation({
  args: {
    purchaseId: v.id("purchases"),
    sessionId: v.string(),
    checkoutUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const p = await ctx.db.get(a.purchaseId);
    if (!p) throw new Error("Unknown purchase");
    if (p.sessionId && p.sessionId !== a.sessionId)
      throw new Error("Conflicting Checkout Session");
    await ctx.db.patch(p._id, {
      sessionId: a.sessionId,
      cleanupAt: undefined,
      checkoutUrl: a.checkoutUrl,
    });
    return null;
  },
});
export const activate = internalMutation({
  args: {
    takeoverId: v.id("takeovers"),
    eventId: v.string(),
    sessionId: v.string(),
    paymentIntentId: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    paid: v.boolean(),
    livemode: v.boolean(),
    receiptEmail: v.optional(v.string()),
  },
  returns: v.object({ activated: v.boolean(), takeoverId: v.id("takeovers") }),
  handler: async (ctx, a) => {
    if (
      !a.paid ||
      a.amountCents !== 299 ||
      a.currency !== "usd" ||
      !a.paymentIntentId
    )
      throw new Error("Invalid payment");
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", a.takeoverId))
      .unique();
    if (!p) throw new Error("Unknown purchase");
    if (
      a.livemode !== (p.environment === "production") ||
      p.environment !== (process.env.WALL_ENVIRONMENT ?? "test")
    )
      throw new Error("Payment environment mismatch");
    const event = await ctx.db
      .query("paymentEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", a.eventId))
      .unique();
    if (event) {
      if (event.purchaseId !== p._id) throw new Error("Conflicting event");
      return { activated: false, takeoverId: a.takeoverId };
    }
    const session = await ctx.db
      .query("purchases")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", a.sessionId))
      .unique();
    const intent = await ctx.db
      .query("purchases")
      .withIndex("by_paymentIntentId", (q) =>
        q.eq("paymentIntentId", a.paymentIntentId),
      )
      .unique();
    if (
      (p.sessionId && p.sessionId !== a.sessionId) ||
      (session && session._id !== p._id) ||
      (intent && intent._id !== p._id) ||
      (p.paymentIntentId && p.paymentIntentId !== a.paymentIntentId)
    )
      throw new Error("Conflicting payment identifiers");
    await ctx.db.insert("paymentEvents", {
      eventId: a.eventId,
      purchaseId: p._id,
      createdAt: Date.now(),
    });
    if (p.paidAt) return { activated: false, takeoverId: a.takeoverId };
    const t = await ctx.db.get(a.takeoverId);
    if (!t || t.status !== "pending" || t.blocked)
      throw new Error("Takeover cannot activate");
    const site = await getSite(ctx),
      previous = (await ctx.db.get(site.currentTakeoverId))!;
    const now = Date.now(),
      sequence = site.currentActivationSequence + 1;
    await ctx.db.patch(previous._id, {
      status: "replaced",
      replacedAt: now,
      endReason: "purchase",
    });
    await ctx.db.patch(t._id, {
      status: "active",
      activatedAt: now,
      activationSequence: sequence,
      ...zeros,
    });
    await ctx.db.patch(p._id, {
      paidAt: now,
      cleanupAt: undefined,
      expiredConfirmed: undefined,
      amountCents: 299,
      currency: "usd",
      sessionId: a.sessionId,
      paymentIntentId: a.paymentIntentId,
      ...(a.receiptEmail
        ? { receiptEmail: a.receiptEmail.trim().slice(0, 800) }
        : {}),
      contactDeleteAt: now + 365 * 86400_000,
    });
    await ctx.db.patch(site._id, {
      currentTakeoverId: t._id,
      currentActivationSequence: sequence,
      totalTakeovers: site.totalTakeovers + 1,
      updatedAt: now,
    });
    const d = await daily(ctx);
    await ctx.db.patch(d._id, { takeovers: d.takeovers + 1 });
    await enqueue(ctx, "activation_email", t._id);
    if (previous.kind === "paid")
      await enqueue(ctx, "replacement_email", previous._id);
    await enqueue(ctx, "checkout_completed", t._id);
    await enqueue(ctx, "takeover_activated", t._id);
    return { activated: true, takeoverId: t._id };
  },
});
export const confirmation = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.object({
    state: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("replaced"),
      v.literal("invalid"),
      v.literal("expired"),
    ),
    owner: v.union(publicOwner, v.null()),
    durationMs: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, a) => {
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", a.tokenHash))
      .unique();
    if (!p) return { state: "invalid" as const, owner: null, durationMs: null };
    if (p.tokenExpiresAt < Date.now())
      return { state: "expired" as const, owner: null, durationMs: null };
    const t = (await ctx.db.get(p.takeoverId))!;
    if (!p.paidAt)
      return { state: "pending" as const, owner: null, durationMs: null };
    return {
      state:
        t.status === "active" ? ("active" as const) : ("replaced" as const),
      owner: await projectOwner(ctx, t),
      durationMs:
        t.replacedAt !== undefined ? t.replacedAt - t.activatedAt! : null,
    };
  },
});

export const expire = internalMutation({
  args: {
    takeoverId: v.id("takeovers"),
    sessionId: v.string(),
    livemode: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", a.takeoverId))
      .unique();
    if (!p || p.paidAt) return null;
    if (
      (p.sessionId && p.sessionId !== a.sessionId) ||
      a.livemode !== (p.environment === "production")
    )
      throw new Error("Conflicting expired checkout");
    await ctx.db.patch(p._id, {
      sessionId: a.sessionId,
      expiredConfirmed: true,
      cleanupAt: Date.now() + 48 * 3600_000,
    });
    return null;
  },
});
