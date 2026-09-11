import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { audit, requireAdmin, requireClaim } from "./rewardModel";
export const access = internalMutation({
  args: {
    id: v.id("claimDocuments"),
    session: v.optional(v.string()),
    write: v.boolean(),
  },
  returns: v.object({
    storageId: v.union(v.id("_storage"), v.null()),
    contentType: v.string(),
  }),
  handler: async (ctx, a) => {
    const doc = await ctx.db.get(a.id);
    if (!doc || doc.deletedAt) throw new Error("Document unavailable");
    let actor: string;
    if (a.session) {
      const c = await requireClaim(ctx, a.session);
      if (c._id !== doc.claimId) throw new Error("Document unavailable");
      if (
        a.write &&
        (!["additional_information_required", "under_review"].includes(
          c.status,
        ) ||
          (c.status === "additional_information_required" &&
            c.deadlineAt <= Date.now()))
      )
        throw new Error("Document upload unavailable");
      actor = "winner";
    } else actor = await requireAdmin(ctx);
    if (a.write && doc.storageId)
      throw new Error(
        "A document is already uploaded. Request a new document to replace it.",
      );
    await audit(
      ctx,
      actor,
      a.write ? "DOCUMENT_UPLOAD_AUTHORIZED" : "DOCUMENT_ACCESSED",
      doc._id,
    );
    return {
      storageId: doc.storageId ?? null,
      contentType: doc.contentType ?? "application/octet-stream",
    };
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("claimDocuments"),
    session: v.optional(v.string()),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const doc = await ctx.db.get(a.id);
    if (!doc || doc.storageId || doc.deletedAt)
      throw new Error("Upload no longer available");
    let actor: string;
    if (a.session) {
      const c = await requireClaim(ctx, a.session);
      if (
        c._id !== doc.claimId ||
        !["additional_information_required", "under_review"].includes(
          c.status,
        ) ||
        (c.status === "additional_information_required" &&
          c.deadlineAt <= Date.now())
      )
        throw new Error("Upload no longer available");
      actor = "winner";
    } else actor = await requireAdmin(ctx);
    await ctx.db.patch(doc._id, {
      storageId: a.storageId,
      contentType: a.contentType,
      size: a.size,
      uploadedAt: Date.now(),
    });
    await audit(ctx, actor, "DOCUMENT_UPLOADED", doc._id);
    return null;
  },
});

export const manage = mutation({
  args: {
    id: v.id("claimDocuments"),
    reason: v.string(),
    deleteAt: v.optional(v.number()),
    confirmed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    if (!a.confirmed || !a.reason.trim() || a.reason.length > 1000)
      throw new Error("Confirmation and a documented reason required");
    const doc = await ctx.db.get(a.id);
    if (!doc || doc.deletedAt) throw new Error("Document unavailable");
    if (a.deleteAt !== undefined) {
      if (!Number.isFinite(a.deleteAt) || a.deleteAt <= Date.now())
        throw new Error("Choose a future retention deadline");
      await ctx.db.patch(doc._id, {
        deleteAt: a.deleteAt,
        retentionOverride: true,
      });
      await audit(ctx, actor, "DOCUMENT_RETENTION_OVERRIDDEN", doc._id, {
        reason: a.reason,
        deleteAt: a.deleteAt,
      });
    } else {
      if (doc.storageId) await ctx.storage.delete(doc.storageId);
      await ctx.db.patch(doc._id, {
        storageId: undefined,
        deletedAt: Date.now(),
        deleteAt: undefined,
      });
      await audit(ctx, actor, "DOCUMENT_DELETED", doc._id, {
        reason: a.reason,
      });
    }
    return null;
  },
});
