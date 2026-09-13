import { resolveDesignAssets, retainDesignAssets, designUploads } from "./designAssets";
import { ownerFeedback } from "./schema";
import { query } from "./_generated/server";
import { previousOwnerName } from "./model";
import { requireAdmin } from "./rewardModel";
import { indexable } from "./growth";
import { emailAllowed } from "./emailPolicy";
import { requestSubscription } from "./milestoneAlerts";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { ensureOwnerAccess, ownerAccess } from "./ownerModel";
import { enqueue, getSite, limit, projectOwner, publicOwner } from "./model";
import { ownerBaseUrl } from "../lib/owner-secrets";
import { validateWallContent } from "../lib/content";
import { audit } from "./rewardModel";
import { validateEmail } from "../lib/validation";
import { sha } from "../lib/audit";
const shared = {
  previousOwnerName: v.union(v.string(), v.null()),
  owner: publicOwner,
  active: v.boolean(),
  replacedAt: v.union(v.number(), v.null()),
  publicId: v.string(),
  searchIndexable: v.boolean(),
  editorial: v.string(),
};
export const ensureAccess = internalMutation({
  args: { takeoverId: v.id("takeovers") },
  returns: v.null(),
  handler: async (ctx, a) => {
    await ensureOwnerAccess(ctx, a.takeoverId);
    return null;
  },
});
export const dashboard = internalQuery({
  args: { token: v.string() },
  returns: v.object({
    ...shared,
    feedback: v.union(ownerFeedback, v.null()),
    feedbackEligible: v.boolean(),
    contentRevision: v.number(),
    weeklyDigestEnabled: v.boolean(),
    milestoneAlerts: v.union(
      v.literal("on"),
      v.literal("pending"),
      v.literal("off"),
    ),
    shareUrl: v.string(),
    shareVisitors: v.number(),
    shareTakeovers: v.number(),
    regions: v.array(
      v.object({ regionCode: v.string(), impressions: v.number() }),
    ),
  }),
  handler: async (ctx, a) => {
    const access = await ownerAccess(ctx, a.token);
    const t = await ctx.db.get(access.takeoverId),
      site = await getSite(ctx);
    if (!t || !t.publicTakeoverId) throw new Error("Takeover unavailable");
    const regions = await ctx.db
      .query("takeoverRegions")
      .withIndex("by_takeoverId_regionCode", (q) => q.eq("takeoverId", t._id))
      .take(300);
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
      .unique();
    const subscriber = purchase?.buyerEmail
      ? await ctx.db
          .query("milestoneSubscribers")
          .withIndex("by_email", (q) =>
            q.eq("emailHash", sha(purchase.buyerEmail.toLowerCase())),
          )
          .unique()
      : null;
    return {
      milestoneAlerts: subscriber?.active
        ? ("on" as const)
        : subscriber?.email && !subscriber.unsubscribedAt
          ? ("pending" as const)
          : ("off" as const),
      feedback: access.feedback ?? null,
      feedbackEligible:
        t.replacedAt !== undefined &&
        site.currentTakeoverId !== t._id &&
        t.kind === "paid" &&
        !!purchase?.paidAt,
      contentRevision: t.contentRevision ?? 0,
      previousOwnerName: await previousOwnerName(ctx, t),
      owner: await projectOwner(ctx, t),
      active: site.currentTakeoverId === t._id && !t.blocked,
      replacedAt: t.replacedAt ?? null,
      publicId: t.publicTakeoverId,
      searchIndexable: indexable(t),
      editorial: indexable(t) ? t.seoSummary! : "",
      weeklyDigestEnabled:
        access.weeklyDigestEnabled &&
        !!purchase?.buyerEmail &&
        (await emailAllowed(ctx, purchase.buyerEmail, "weekly_digest_email")),
      shareUrl: `${ownerBaseUrl()}/takeover/${t.publicTakeoverId}?via=share`,
      shareVisitors: t.shareVisitors ?? 0,
      shareTakeovers: t.shareTakeovers ?? 0,
      regions: regions.map((r) => ({
        regionCode: r.regionCode,
        impressions: r.impressions,
      })),
    };
  },
});
export const preferences = internalMutation({
  args: {
    token: v.string(),
    weeklyDigestEnabled: v.optional(v.boolean()),
    milestoneAlertsEnabled: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const access = await ownerAccess(ctx, a.token);
    if (a.weeklyDigestEnabled) {
      const p = await ctx.db
        .query("purchases")
        .withIndex("by_takeoverId", (q) =>
          q.eq("takeoverId", access.takeoverId),
        )
        .unique();
      if (
        !p?.buyerEmail ||
        !(await emailAllowed(ctx, p.buyerEmail, "weekly_digest_email"))
      )
        throw Error(
          "Optional emails are paused for this address. Contact support for help.",
        );
    }
    if (a.weeklyDigestEnabled !== undefined)
      await ctx.db.patch(access._id, {
        weeklyDigestEnabled: a.weeklyDigestEnabled,
      });
    if (a.milestoneAlertsEnabled !== undefined) {
      await limit(ctx, "owner-alerts:" + access.takeoverId, 5, 3600_000);
      const p = await ctx.db
        .query("purchases")
        .withIndex("by_takeoverId", (q) =>
          q.eq("takeoverId", access.takeoverId),
        )
        .unique();
      if (!p?.buyerEmail)
        throw new Error(
          "Checkout email is no longer available. Use the homepage signup.",
        );
      if (a.milestoneAlertsEnabled) {
        if (!(await emailAllowed(ctx, p.buyerEmail, "milestone_confirm")))
          throw Error(
            "Optional emails are paused for this address. Contact support for help.",
          );
        await requestSubscription(ctx, p.buyerEmail);
      } else {
        const row = await ctx.db
          .query("milestoneSubscribers")
          .withIndex("by_email", (q) =>
            q.eq("emailHash", sha(p.buyerEmail.toLowerCase())),
          )
          .unique();
        if (row)
          await ctx.db.patch(row._id, {
            active: false,
            email: "",
            expiresAt: Date.now(),
            generation: row.generation + 1,
          });
      }
    }
    return null;
  },
});
export const unsubscribe = internalMutation({
  args: { token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    if (!/^[a-f0-9]{64}$/.test(a.token)) return false;
    const access = await ctx.db
      .query("ownerAccess")
      .withIndex("by_unsubscribe", (q) => q.eq("unsubscribeHash", sha(a.token)))
      .unique();
    if (!access) return false;
    await ctx.db.patch(access._id, { weeklyDigestEnabled: false });
    return true;
  },
});
export const requestLink = internalMutation({
  args: { number: v.number(), email: v.string(), ipHash: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    await limit(ctx, "owner-link-ip:" + a.ipHash, 5, 3600_000);
    const email = validateEmail(a.email);
    await limit(
      ctx,
      "owner-link-email:" + sha(email.toLowerCase()),
      3,
      3600_000,
    );
    if (!Number.isSafeInteger(a.number) || a.number < 1) return null;
    const site = await getSite(ctx);
    const t = await ctx.db
      .query("takeovers")
      .withIndex("by_takeoverNumber", (q) =>
        q.eq("takeoverNumber", a.number - (site.numberingOffset ?? 0)),
      )
      .unique();
    if (!t) return null;
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
      .unique();
    if (
      !p?.buyerEmail ||
      p.buyerEmail.toLowerCase() !== email.toLowerCase() ||
      (!p.paidAt && !p.issuedAt)
    )
      return null;
    await ensureOwnerAccess(ctx, t._id);
    await enqueue(ctx, "owner_access_email", t._id, crypto.randomUUID());
    return null;
  },
});
export const sharedTakeover = internalQuery({
  args: { publicId: v.string() },
  returns: v.union(v.null(), v.object(shared)),
  handler: async (ctx, a) => {
    if (!/^ttw_[a-f0-9]{32}$/.test(a.publicId)) return null;
    const t = await ctx.db
      .query("takeovers")
      .withIndex("by_publicId", (q) => q.eq("publicTakeoverId", a.publicId))
      .unique();
    if (
      !t?.activatedAt ||
      t.blocked ||
      t.status === "rejected" ||
      t.status === "pending"
    )
      return null;
    const site = await getSite(ctx);
    return {
      previousOwnerName: await previousOwnerName(ctx, t),
      owner: await projectOwner(ctx, t),
      active: site.currentTakeoverId === t._id,
      replacedAt: t.replacedAt ?? null,
      publicId: a.publicId,
      searchIndexable: indexable(t),
      editorial: indexable(t) ? t.seoSummary! : "",
    };
  },
});
export const queueWeeklyDigest = internalMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    if (
      process.env.WALL_ENVIRONMENT !== "production" ||
      process.env.WEEKLY_OWNER_DIGEST_ENABLED === "false"
    )
      return false;
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    if (!site) return false;
    const t = await ctx.db.get(site.currentTakeoverId);
    if (!t?.activatedAt || t.blocked || t.status !== "active") return false;
    const access = await ensureOwnerAccess(ctx, t._id);
    if (!access?.weeklyDigestEnabled) return false;
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
      .unique();
    if (
      p?.environment !== "production" ||
      p.paymentIssue ||
      !(await emailAllowed(ctx, p.buyerEmail, "weekly_digest_email"))
    )
      return false;
    const monday = new Date(Date.now());
    monday.setUTCHours(0, 0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const week = monday.toISOString().slice(0, 10);
    const key = `weekly_digest_email:${t._id}:${week}`;
    if (
      await ctx.db
        .query("jobs")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique()
    )
      return false;
    await enqueue(ctx, "weekly_digest_email", t._id, week);
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    await ctx.db.patch(job!._id, {
      digest: {
        displayName: t.displayName ?? t.domain,
        number:
          t.takeoverNumber === undefined
            ? null
            : t.takeoverNumber + (site.numberingOffset ?? 0),
        impressions: t.impressions,
        uniqueVisitors: t.uniqueVisitors,
        clicks: t.clicks,
        activatedAt: t.activatedAt,
        snapshotAt: Date.now(),
      },
    });
    return true;
  },
});

export const edit = internalMutation({
  args: {
    token: v.string(),
    expectedRevision: v.number(),
    contentType: v.union(v.literal("link"), v.literal("personal")),
    websiteUrl: v.string(),
    displayName: v.string(),
    description: v.string(),
    morseMessage: v.optional(v.string()),
    canvasDesign: v.optional(v.string()),
    uploadKey: v.string(),
    ownerHash: v.string(),
    removeImage: v.boolean(),
    canvasUploads: v.optional(designUploads),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const access = await ownerAccess(ctx, a.token);
    const t = await ctx.db.get(access.takeoverId),
      site = await getSite(ctx);
    if (
      !t ||
      site.currentTakeoverId !== t._id ||
      t.status !== "active" ||
      t.blocked ||
      t.replacedAt !== undefined
    )
      throw new Error("Only the current owner can edit their live takeover.");
    if ((t.contentRevision ?? 0) !== a.expectedRevision)
      throw new Error(
        "Your content changed in another tab. Refresh before editing again.",
      );
    if (site.auditMigrationCursor !== undefined)
      throw new Error("History maintenance is in progress. Try again shortly.");
    await limit(ctx, "owner-edit:" + t._id, 20, 3600_000);
    const content = validateWallContent(a);
    let logoStorageId = a.removeImage ? undefined : t.logoStorageId;
    if (a.uploadKey) {
      if (a.removeImage)
        throw new Error("Choose either a new image or remove the image.");
      const upload = await ctx.db
        .query("uploads")
        .withIndex("by_key", (q) => q.eq("key", a.uploadKey))
        .unique();
      if (
        !upload?.storageId ||
        upload.claimed ||
        upload.ownerHash !== a.ownerHash ||
        upload.expiresAt <= Date.now()
      )
        throw new Error("Image upload expired. Upload it again.");
      logoStorageId = upload.storageId;
      await ctx.db.patch(upload._id, { claimed: true });
    }
    const canvasAssets = await resolveDesignAssets(ctx, content.canvasDesign, a.canvasUploads, a.ownerHash, t.canvasAssets);
    await retainDesignAssets(ctx,t._id,canvasAssets);
    const before = {
      contentType: t.contentType ?? "link",
      linkType: t.linkType ?? "website",
      websiteUrl: t.websiteUrl,
      domain: t.domain,
      displayName: t.displayName ?? t.domain,
      description: t.description,
      ...(t.canvasDesign ? { canvasDesign:t.canvasDesign,canvasAssets:t.canvasAssets ?? [] } : {}),
      ...(t.morseMessage ? { morseMessage: t.morseMessage } : {}),
      ...(t.logoStorageId ? { logoStorageId: t.logoStorageId } : {}),
    };
    const after = { ...content, ...(content.canvasDesign ? {canvasAssets} : {}), ...(logoStorageId ? { logoStorageId } : {}) };
    await ctx.db.patch(t._id, {
      ...content,
      logoStorageId,
      morseMessage: content.morseMessage,
      canvasDesign: content.canvasDesign,
      canvasAssets: content.canvasDesign ? canvasAssets : undefined,
      originalContent: t.originalContent ?? before,
      contentRevision: (t.contentRevision ?? 0) + 1,
    });
    await audit(ctx, "owner:" + t._id, "OWNER_CONTENT_EDITED", t._id, {
      revision: (t.contentRevision ?? 0) + 1,
      before,
      after,
    });
    return null;
  },
});

export const repeat = internalMutation({
  args: { token: v.string(), ownerHash: v.string() },
  returns: v.object({
    contentType: v.string(),
    displayName: v.string(),
    description: v.string(),
    morseMessage: v.optional(v.string()),
    canvasDesign: v.optional(v.string()),
    websiteUrl: v.string(),
    logoUrl: v.string(),
    uploadKey: v.string(),
    buyerEmail: v.string(),
    weeklyDigestEnabled: v.boolean(),
    amaEnabled: v.boolean(),
    canvasImages: v.optional(v.array(v.object({key:v.string(),url:v.string(),uploadKey:v.string()}))),
  }),
  handler: async (ctx, a) => {
    const access = await ownerAccess(ctx, a.token);
    await limit(ctx, "owner-repeat:" + access.takeoverId, 10, 3600_000);
    const t = await ctx.db.get(access.takeoverId);
    if (
      !t ||
      t.blocked ||
      (t.contentType !== "personal" && t.outboundLinkEnabled === false)
    )
      throw new Error(
        "This content cannot be reused. Start a new draft instead.",
      );
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
      .unique();
    const content = validateWallContent(t);
    let uploadKey = "",
      logoUrl = "";
    if (t.logoStorageId) {
      logoUrl = (await ctx.storage.getUrl(t.logoStorageId)) ?? "";
      if (logoUrl) {
        uploadKey = crypto.randomUUID();
        await ctx.db.insert("uploads", {
          key: uploadKey,
          ownerHash: a.ownerHash,
          storageId: t.logoStorageId,
          claimed: false,
          expiresAt: Date.now() + 48 * 3600_000,
        });
      }
    }
    const canvasImages = [];
    for(const asset of t.canvasAssets ?? []) {
      const url=await ctx.storage.getUrl(asset.storageId);
      if(!url)continue;
      const key=crypto.randomUUID();
      await ctx.db.insert("uploads",{key,ownerHash:a.ownerHash,storageId:asset.storageId,claimed:false,expiresAt:Date.now()+48*3600_000});
      canvasImages.push({key:asset.key,url,uploadKey:key});
    }
    return {
      ...(content.canvasDesign ? {canvasDesign:content.canvasDesign,canvasImages} : {}),
      contentType: content.contentType,
      displayName: content.displayName,
      description: content.description,
      ...(content.morseMessage ? { morseMessage: content.morseMessage } : {}),
      websiteUrl: content.websiteUrl,
      logoUrl,
      uploadKey,
      buyerEmail: p?.buyerEmail ?? "",
      weeklyDigestEnabled: access.weeklyDigestEnabled,
      amaEnabled: t.amaEnabled ?? false,
    };
  },
});

export const feedback = internalMutation({
  args: { token: v.string(), answer: ownerFeedback },
  returns: v.null(),
  handler: async (ctx, a) => {
    const access = await ownerAccess(ctx, a.token);
    const takeover = await ctx.db.get(access.takeoverId);
    const site = await getSite(ctx);
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", access.takeoverId))
      .unique();
    if (
      !takeover ||
      takeover.replacedAt === undefined ||
      site.currentTakeoverId === takeover._id ||
      takeover.kind !== "paid" ||
      !purchase?.paidAt
    )
      throw new Error("Feedback is available after a paid reign ends.");
    await limit(ctx, "owner-feedback:" + access._id, 10, 3600_000);
    await ctx.db.patch(access._id, {
      feedback: a.answer,
      feedbackAt: Date.now(),
    });
    return null;
  },
});
export const recentFeedback = query({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      publicId: v.union(v.string(), v.null()),
      answer: ownerFeedback,
      at: v.number(),
      environment: v.string(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("ownerAccess")
      .withIndex("by_feedbackAt", (q) => q.gt("feedbackAt", 0))
      .order("desc")
      .take(50);
    const results = [];
    for (const row of rows) {
      if (!row.feedback || !row.feedbackAt) continue;
      const takeover = await ctx.db.get(row.takeoverId);
      const purchase = await ctx.db
        .query("purchases")
        .withIndex("by_takeoverId", (q) => q.eq("takeoverId", row.takeoverId))
        .unique();
      if (!takeover) continue;
      results.push({
        name: takeover.displayName || takeover.domain,
        publicId: takeover.publicTakeoverId ?? null,
        answer: row.feedback,
        at: row.feedbackAt,
        environment: purchase?.environment ?? "unknown",
      });
    }
    return results;
  },
});
