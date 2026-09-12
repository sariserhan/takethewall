import { policyFor, applyProviderSuppression } from "./emailPolicy";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  internalMutation,
  internalAction,
  query,
  type MutationCtx,
} from "./_generated/server";
import { sha } from "../lib/audit";
import { requireAdmin } from "./rewardModel";

export async function rememberContact(
  ctx: MutationCtx,
  email: string,
  source: string,
  createdAt = Date.now(),
) {
  email = email.trim().toLowerCase();
  if (
    !email ||
    !email.includes("@") ||
    (await policyFor(ctx, email))?.deletedAt
  )
    return;
  const emailHash = sha(email),
    old = await ctx.db
      .query("emailContacts")
      .withIndex("by_email", (q) => q.eq("emailHash", emailHash))
      .unique();
  if (!old)
    await ctx.db.insert("emailContacts", {
      email,
      emailHash,
      sources: [source],
      createdAt,
      updatedAt: Date.now(),
    });
  else if (!old.sources.includes(source) || createdAt < old.createdAt)
    await ctx.db.patch(old._id, {
      sources: [...new Set([...old.sources, source])],
      createdAt: Math.min(old.createdAt, createdAt),
      updatedAt: Date.now(),
    });
}
const historyArgs = {
  key: v.string(),
  email: v.string(),
  kind: v.string(),
  subject: v.string(),
  state: v.string(),
  createdAt: v.optional(v.number()),
  providerId: v.optional(v.string()),
};
export async function trackEmail(
  ctx: MutationCtx,
  a: {
    key: string;
    email: string;
    kind: string;
    subject: string;
    state: string;
    createdAt?: number;
    providerId?: string;
  },
) {
  if (!a.email || (await policyFor(ctx, a.email))?.deletedAt) return;
  const email = a.email.toLowerCase(),
    emailHash = sha(email);
  await rememberContact(ctx, email, "email recipient", a.createdAt);
  const old = await ctx.db
    .query("emailHistory")
    .withIndex("by_key", (q) => q.eq("key", a.key))
    .unique();
  const values = {
    email,
    emailHash,
    kind: a.kind,
    subject: a.subject,
    state: a.state,
    updatedAt: Date.now(),
    ...(a.providerId ? { providerId: a.providerId } : {}),
    ...(a.state === "accepted" ? { sentAt: old?.sentAt ?? Date.now() } : {}),
  };
  if (a.providerId) await applyProviderSuppression(ctx, email, a.providerId);
  if (old) await ctx.db.patch(old._id, values);
  else
    await ctx.db.insert("emailHistory", {
      ...values,
      key: a.key,
      createdAt: a.createdAt ?? Date.now(),
    });
}
export const track = internalMutation({
  args: historyArgs,
  returns: v.null(),
  handler: async (ctx, a) => {
    await trackEmail(ctx, a);
    return null;
  },
});
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const prefix = (a.search ?? "").trim().toLowerCase().slice(0, 254);
    const page = await ctx.db
      .query("emailContacts")
      .withIndex("by_address", (q) =>
        q.gte("email", prefix).lt("email", prefix + "\uffff"),
      )
      .paginate(a.paginationOpts);
    const rows = await Promise.all(
      page.page.map(async (c) => {
        const [wall, milestone, last, policy] = await Promise.all([
          ctx.db
            .query("wallSubscribers")
            .withIndex("by_email", (q) => q.eq("emailHash", c.emailHash))
            .unique(),
          ctx.db
            .query("milestoneSubscribers")
            .withIndex("by_email", (q) => q.eq("emailHash", c.emailHash))
            .unique(),
          ctx.db
            .query("emailHistory")
            .withIndex("by_email", (q) => q.eq("emailHash", c.emailHash))
            .order("desc")
            .first(),
          policyFor(ctx, c.email),
        ]);
        const status = (s: typeof wall | typeof milestone) =>
          !s
            ? "Not subscribed"
            : s.active
              ? "Confirmed"
              : s.expiresAt <= Date.now()
                ? "Inactive / expired"
                : "Pending confirmation";
        const latestEvent = last?.providerId
          ? await ctx.db
              .query("emailEvents")
              .withIndex("by_provider", (q) =>
                q.eq("providerId", last.providerId!),
              )
              .order("desc")
              .first()
          : null;
        return {
          suppression: policy?.reason ?? null,
          stoppedAt: policy?.stoppedAt ?? null,
          wallConfirmedAt: wall?.confirmedAt ?? null,
          milestoneConfirmedAt: milestone?.confirmedAt ?? null,
          id: c._id,
          email: c.email,
          sources: c.sources,
          createdAt: c.createdAt,
          wall: wall?.unsubscribedAt
            ? "Unsubscribed"
            : wall?.active
              ? `Confirmed · ${wall.frequency}`
              : status(wall),
          milestone: status(milestone),
          last: last
            ? {
                kind: last.kind,
                state: latestEvent?.type.replace("email.", "") ?? last.state,
                at:
                  latestEvent?.occurredAt ??
                  last.sentAt ??
                  (last.state === "historical processed"
                    ? last.createdAt
                    : last.updatedAt),
              }
            : null,
        };
      }),
    );
    return JSON.stringify({
      rows,
      cursor: page.continueCursor,
      done: page.isDone,
    });
  },
});
export const history = query({
  args: { email: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.string(),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const page = await ctx.db
      .query("emailHistory")
      .withIndex("by_email", (q) =>
        q.eq("emailHash", sha(a.email.trim().toLowerCase())),
      )
      .order("desc")
      .paginate(a.paginationOpts);
    const rows = await Promise.all(
      page.page.map(async (r) => ({
        id: r._id,
        kind: r.kind,
        subject: r.subject,
        state: r.state,
        createdAt: r.createdAt,
        sentAt: r.sentAt ?? null,
        updatedAt: r.updatedAt,
        events: r.providerId
          ? await ctx.db
              .query("emailEvents")
              .withIndex("by_provider", (q) =>
                q.eq("providerId", r.providerId!),
              )
              .order("desc")
              .take(20)
          : [],
      })),
    );
    return JSON.stringify({
      rows,
      cursor: page.continueCursor,
      done: page.isDone,
    });
  },
});
// One paginated source per mutation; actions orchestrate the independent batches.
const sources = [
  "purchases",
  "milestoneSubscribers",
  "wallSubscribers",
  "rewardClaims",
  "supportTickets",
  "transactionalMail",
  "jobs",
  "emailHistory",
] as const;
export const reconcileSource = internalMutation({
  args: { source: v.union(...sources.map((s) => v.literal(s))) },
  returns: v.null(),
  handler: async (ctx, { source }) => {
    const progress = await ctx.db
      .query("emailIndexProgress")
      .withIndex("by_source", (q) => q.eq("source", source))
      .unique();
    const page = await ctx.db
      .query(source)
      .withIndex("by_creation_time")
      .paginate({
        cursor: progress?.done ? null : (progress?.cursor ?? null),
        numItems: 30,
      });
    for (const row of page.page) {
      if (source === "emailHistory") {
        if (
          "providerId" in row &&
          row.providerId &&
          "email" in row &&
          row.email
        )
          await applyProviderSuppression(ctx, row.email, row.providerId);
        continue;
      }
      if ("buyerEmail" in row) {
        await rememberContact(ctx, row.buyerEmail, "checkout", row.createdAt);
        if (row.receiptEmail)
          await rememberContact(
            ctx,
            row.receiptEmail,
            "receipt",
            row.createdAt,
          );
      } else if ("email" in row)
        await rememberContact(
          ctx,
          row.email,
          source === "wallSubscribers"
            ? "wall subscriber"
            : source === "milestoneSubscribers"
              ? "milestone subscriber"
              : source === "rewardClaims"
                ? "reward claimant"
                : "support contact",
          row.createdAt,
        );
      else if ("to" in row) {
        await rememberContact(ctx, row.to, "email recipient", row.createdAt);
        const old = await ctx.db
          .query("emailHistory")
          .withIndex("by_key", (q) => q.eq("key", row.key))
          .unique();
        if (!old)
          await trackEmail(ctx, {
            key: row.key,
            email: row.to,
            kind: row.kind,
            subject: row.subject,
            state: row.state === "sent" ? "historical processed" : row.state,
            createdAt: row.createdAt,
          });
      } else if ("takeoverId" in row && row.kind.endsWith("_email")) {
        const purchase = await ctx.db
          .query("purchases")
          .withIndex("by_takeoverId", (q) => q.eq("takeoverId", row.takeoverId))
          .unique();
        const email =
          (row.adminRecipient ??
            (row.recoveryToReceipt
              ? purchase?.receiptEmail
              : purchase?.buyerEmail)) ||
          "";
        const old = await ctx.db
          .query("emailHistory")
          .withIndex("by_key", (q) => q.eq("key", row.key))
          .unique();
        if (!old && email)
          await trackEmail(ctx, {
            key: row.key,
            email,
            kind: row.kind,
            subject: row.kind.replaceAll("_", " "),
            state: row.state === "sent" ? "historical processed" : row.state,
            createdAt: row.timestamp,
          });
      }
    }
    const values = { source, cursor: page.continueCursor, done: page.isDone };
    if (progress) await ctx.db.patch(progress._id, values);
    else await ctx.db.insert("emailIndexProgress", values);
    return null;
  },
});
export const reconcile = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const source of sources)
      await ctx.runMutation(internal.emailDirectory.reconcileSource, {
        source,
      });
    return null;
  },
});
