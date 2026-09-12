import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin, audit } from "./rewardModel";
import { validateEmail } from "../lib/validation";
import {
  emailHash,
  policyFor,
  suppressEmail,
  disableSubscriptions,
} from "./emailPolicy";
export const details = query({
  args: { email: v.string() },
  returns: v.string(),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const hash = emailHash(a.email);
    const [policy, wall, milestone] = await Promise.all([
      policyFor(ctx, a.email),
      ctx.db
        .query("wallSubscribers")
        .withIndex("by_email", (q) => q.eq("emailHash", hash))
        .unique(),
      ctx.db
        .query("milestoneSubscribers")
        .withIndex("by_email", (q) => q.eq("emailHash", hash))
        .unique(),
    ]);
    return JSON.stringify({
      reason: policy?.reason ?? null,
      stoppedAt: policy?.stoppedAt ?? null,
      deletionState: policy?.deletionState ?? null,
      deletedAt: policy?.deletedAt ?? null,
      wall: wall
        ? {
            active: wall.active,
            confirmedAt: wall.confirmedAt ?? null,
            unsubscribedAt: wall.unsubscribedAt ?? null,
          }
        : null,
      milestone: milestone
        ? {
            active: milestone.active,
            confirmedAt: milestone.confirmedAt ?? null,
            unsubscribedAt: milestone.unsubscribedAt ?? null,
          }
        : null,
    });
  },
});
export const unsubscribe = mutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx),
      email = validateEmail(a.email);
    await suppressEmail(ctx, email, "admin_unsubscribe", Date.now());
    await audit(ctx, actor, "CONTACT_UNSUBSCRIBED", emailHash(email));
    return null;
  },
});
export const erase = mutation({
  args: { email: v.string(), confirmation: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx),
      email = validateEmail(a.email).toLowerCase(),
      hash = emailHash(email);
    if (a.confirmation.trim().toLowerCase() !== email)
      throw Error("Type the contact email to confirm deletion.");
    const old = await policyFor(ctx, email),
      now = Date.now();
    if (old?.deletedAt) return null;
    const values = {
      emailHash: hash,
      reason: old?.reason ?? ("admin_unsubscribe" as const),
      stoppedAt: old?.stoppedAt ?? now,
      deletedAt: now,
      deletionState: "pending" as const,
      deletionSource: 0,
      deletionCursor: null,
    };
    const id = old ? old._id : await ctx.db.insert("emailPolicies", values);
    if (old) await ctx.db.patch(id, values);
    await disableSubscriptions(ctx, hash, now);
    const contact = await ctx.db
      .query("emailContacts")
      .withIndex("by_email", (q) => q.eq("emailHash", hash))
      .unique();
    if (contact) await ctx.db.delete(contact._id);
    await audit(ctx, actor, "CONTACT_DELETION_REQUESTED", hash);
    await ctx.scheduler.runAfter(0, internal.contactManagement.eraseBatch, {
      id,
    });
    return null;
  },
});
// Parent email fields are erased last, so earlier passes can locate associated records.
const sources = [
  "jobs",
  "transactionalMail",
  "emailHistory",
  "supportMessages",
  "supportTickets",
  "rewardClaims",
  "ownerAccess",
  "purchases",
  "wallSubscribers",
  "milestoneSubscribers",
  "notificationSettings",
  "adminAudit",
] as const;
export const eraseBatch = internalMutation({
  args: { id: v.id("emailPolicies") },
  returns: v.null(),
  handler: async (ctx, a) => {
    const policy = await ctx.db.get(a.id);
    if (!policy?.deletedAt || policy.deletionState !== "pending") return null;
    const source = sources[policy.deletionSource ?? 0],
      matches = (email: string | undefined) =>
        !!email && emailHash(email) === policy.emailHash;
    if (!source) {
      await ctx.db.patch(policy._id, {
        deletionState: "complete",
        deletionCursor: null,
      });
      return null;
    }
    const page = await ctx.db
      .query(source)
      .withIndex("by_creation_time")
      .paginate({ cursor: policy.deletionCursor ?? null, numItems: 30 });
    for (const row of page.page) {
      if (source === "jobs") {
        // Narrow on the table discriminator; optional fields need not exist on legacy rows.
        const job = await ctx.db.get(
          row._id as import("./_generated/dataModel").Id<"jobs">,
        );
        if (!job) continue;
        const p = await ctx.db
          .query("purchases")
          .withIndex("by_takeoverId", (q) => q.eq("takeoverId", job.takeoverId))
          .unique();
        const related = matches(p?.buyerEmail) || matches(p?.receiptEmail);
        const recipient =
          job.kind === "admin_takeover_email"
            ? (job.adminRecipient ?? "serhan.sari@yahoo.com")
            : job.kind === "owner_access_email" && job.recoveryToReceipt
              ? p?.receiptEmail
              : p?.buyerEmail;
        if (
          job.kind.endsWith("_email") &&
          (matches(recipient) ||
            (job.kind === "admin_takeover_email" && related))
        ) {
          await ctx.db.patch(job._id, {
            adminNotice: undefined,
            ...(matches(job.adminRecipient) ? { adminRecipient: "" } : {}),
            ...(job.state !== "sent"
              ? { state: "sent" as const, lastError: "Contact deleted" }
              : {}),
          });
          const log = await ctx.db
            .query("emailHistory")
            .withIndex("by_key", (q) => q.eq("key", job.key))
            .unique();
          if (log && log.state !== "accepted")
            await ctx.db.patch(log._id, {
              state: "skipped",
              updatedAt: Date.now(),
            });
        }
      } else if ("to" in row && "body" in row && matches(row.to)) {
        await ctx.db.patch(row._id, {
          to: "",
          body: "",
          subject: "Contact deleted",
          state: "sent",
          lastError: undefined,
        });
      } else if (
        "emailHash" in row &&
        "subject" in row &&
        row.emailHash === policy.emailHash
      ) {
        await ctx.db.delete(row._id);
      } else if ("ticketId" in row && "adminId" in row) {
        const ticket = await ctx.db.get(row.ticketId);
        if (matches(ticket?.email)) await ctx.db.delete(row._id);
      } else if (
        "emailHash" in row &&
        "confirmHash" in row &&
        row.emailHash === policy.emailHash
      ) {
        await ctx.db.delete(row._id);
      } else if ("email" in row && matches(row.email)) {
        if ("topic" in row)
          await ctx.db.patch(row._id, {
            email: "",
            name: "",
            message: "Contact data deleted",
          });
        else if ("tokenVersion" in row)
          await ctx.db.patch(row._id, {
            email: "",
            tokenHash: undefined,
            tokenSeed: undefined,
            tokenVersion: row.tokenVersion + 1,
            otpHash: undefined,
            otpSeed: undefined,
            otpUsed: true,
          });
        else await ctx.db.delete(row._id);
      } else if (
        "weeklyDigestEnabled" in row &&
        "seed" in row &&
        "takeoverId" in row
      ) {
        const p = await ctx.db
          .query("purchases")
          .withIndex("by_takeoverId", (q) => q.eq("takeoverId", row.takeoverId))
          .unique();
        if (matches(p?.buyerEmail)) await ctx.db.delete(row._id);
      } else if ("buyerEmail" in row) {
        const buyer = matches(row.buyerEmail),
          receipt = matches(row.receiptEmail);
        if (buyer || receipt)
          await ctx.db.patch(row._id, {
            ...(buyer
              ? {
                  buyerEmail: "",
                  buyerEmailKey: "",
                  weeklyDigestEnabled: false,
                }
              : {}),
            ...(receipt
              ? { receiptEmail: undefined, receiptEmailKey: "" }
              : {}),
          });
      } else if ("metadata" in row && "actor" in row) {
        const metadata = row.metadata.replace(
          /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g,
          (value) => (matches(value) ? "[deleted email]" : value),
        );
        if (metadata !== row.metadata || matches(row.actor))
          await ctx.db.patch(row._id, {
            metadata,
            ...(matches(row.actor) ? { actor: "deleted contact" } : {}),
          });
      } else if ("recipient" in row && matches(row.recipient))
        await ctx.db.patch(row._id, {
          recipient: "",
          enabled: false,
          revision: row.revision + 1,
        });
    }
    const next = (policy.deletionSource ?? 0) + (page.isDone ? 1 : 0),
      complete = next >= sources.length;
    await ctx.db.patch(policy._id, {
      deletionSource: next,
      deletionCursor: page.isDone ? null : page.continueCursor,
      deletionState: complete ? "complete" : "pending",
    });
    if (!complete)
      await ctx.scheduler.runAfter(0, internal.contactManagement.eraseBatch, {
        id: a.id,
      });
    else
      await audit(
        ctx,
        "system",
        "CONTACT_DELETION_COMPLETED",
        policy.emailHash,
      );
    return null;
  },
});
export const pending = internalQuery({
  args: {},
  returns: v.array(v.id("emailPolicies")),
  handler: async (ctx) =>
    (
      await ctx.db
        .query("emailPolicies")
        .withIndex("by_deletion", (q) => q.eq("deletionState", "pending"))
        .take(5)
    ).map((p) => p._id),
});
export const resume = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const id of await ctx.runQuery(internal.contactManagement.pending, {}))
      await ctx.runMutation(internal.contactManagement.eraseBatch, { id });
    return null;
  },
});
