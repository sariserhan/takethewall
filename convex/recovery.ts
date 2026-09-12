import { internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { checkoutResumeToken } from "../lib/owner-secrets";
import { emailAllowed, policyFor } from "./emailPolicy";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { sha } from "../lib/audit";
import { validateEmail } from "../lib/validation";
import { enqueue, limit } from "./model";
import { ensureOwnerAccess } from "./ownerModel";
export const indexContacts = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("purchases")
      .withIndex("by_buyerEmailKey", (q) => q.eq("buyerEmailKey", undefined))
      .take(50);
    for (const p of rows)
      await ctx.db.patch(p._id, {
        buyerEmailKey: p.buyerEmail ? sha(p.buyerEmail.toLowerCase()) : "",
        receiptEmailKey: p.receiptEmail
          ? sha(p.receiptEmail.toLowerCase())
          : "",
      });
    return rows.length;
  },
});
export const find = internalMutation({
  args: { email: v.string(), ipHash: v.string() },
  returns: v.array(
    v.object({
      takeoverId: v.id("takeovers"),
      sessionId: v.union(v.string(), v.null()),
      paid: v.boolean(),
    }),
  ),
  handler: async (ctx, a) => {
    const email = validateEmail(a.email).toLowerCase();
    await limit(ctx, "recovery-ip:" + a.ipHash, 5, 3600_000);
    await limit(ctx, "recovery-email:" + sha(email), 3, 3600_000);
    await limit(ctx, "recovery-global", 100, 3600_000);
    const rows = [
      ...(await ctx.db
        .query("purchases")
        .withIndex("by_buyerEmailKey", (q) => q.eq("buyerEmailKey", sha(email)))
        .order("desc")
        .take(3)),
      ...(await ctx.db
        .query("purchases")
        .withIndex("by_receiptEmailKey", (q) =>
          q.eq("receiptEmailKey", sha(email)),
        )
        .order("desc")
        .take(3)),
    ];
    const result = [];
    for (const p of [...new Map(rows.map((p) => [p._id, p])).values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 3)) {
      if (
        p.paymentIssue ||
        (!p.buyerEmail && !p.receiptEmail) ||
        p.environment !== (process.env.WALL_ENVIRONMENT ?? "test")
      )
        continue;
      const t = await ctx.db.get(p.takeoverId);
      if (!t || t.blocked || t.status === "rejected") continue;
      result.push({
        takeoverId: t._id,
        sessionId: p.sessionId ?? null,
        paid: !!(p.paidAt || p.issuedAt),
      });
    }
    return result;
  },
});
export const sendLink = internalMutation({
  args: { takeoverId: v.id("takeovers"), email: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const email = validateEmail(a.email).toLowerCase();
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", a.takeoverId))
      .unique();
    const t = await ctx.db.get(a.takeoverId);
    if (
      p &&
      t &&
      !p.paidAt &&
      !p.issuedAt &&
      p.buyerEmail.toLowerCase() === email
    ) {
      await queueResume(ctx, p);
      return null;
    }
    if (
      !p ||
      !t ||
      t.blocked ||
      !t.activatedAt ||
      !(p.paidAt || p.issuedAt) ||
      p.paymentIssue ||
      ![p.buyerEmail.toLowerCase(), p.receiptEmail?.toLowerCase()].includes(
        email,
      )
    )
      return null;
    await ensureOwnerAccess(ctx, t._id);
    const suffix =
      "recovery:" + sha(email) + ":" + Math.floor(Date.now() / 3600_000);
    await enqueue(ctx, "owner_access_email", t._id, suffix);
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_key", (q) =>
        q.eq("key", `owner_access_email:${t._id}:${suffix}`),
      )
      .unique();
    if (job)
      await ctx.db.patch(job._id, {
        recoveryToReceipt: p.buyerEmail.toLowerCase() !== email,
      });
    return null;
  },
});

async function queueResume(ctx: MutationCtx, p: Doc<"purchases">) {
  const takeover = await ctx.db.get(p.takeoverId);
  if (
    !takeover ||
    takeover.blocked ||
    takeover.status !== "pending" ||
    p.paidAt ||
    p.issuedAt ||
    p.paymentIssue ||
    !p.sessionId ||
    p.checkoutExpiresAt <= Date.now() ||
    !p.buyerEmail ||
    p.environment !== (process.env.WALL_ENVIRONMENT ?? "test")
  )
    return;
  if (
    !(await emailAllowed(ctx, p.buyerEmail, "checkout_resume_email")) ||
    (await policyFor(ctx, p.buyerEmail))?.reason
  )
    return;
  const seed = p.resumeSeed ?? crypto.randomUUID() + crypto.randomUUID();
  await ctx.db.patch(p._id, {
    resumeSeed: seed,
    resumeHash: sha(checkoutResumeToken(seed)),
  });
  // One requested email per checkout, including across tabs and retries.
  await enqueue(ctx, "checkout_resume_email", p.takeoverId);
}
export const requestResume = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", a.tokenHash))
      .unique();
    if (!p || p.tokenExpiresAt <= Date.now()) return null;
    await limit(ctx, "resume:" + p._id, 3, 3600_000);
    await queueResume(ctx, p);
    return null;
  },
});
export const resume = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      takeoverId: v.id("takeovers"),
      sessionId: v.string(),
      requestKey: v.string(),
      name: v.string(),
      description: v.string(),
      environment: v.string(),
    }),
  ),
  handler: async (ctx, a) => {
    if (!/^[a-f0-9]{64}$/.test(a.tokenHash)) return null;
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_resumeHash", (q) => q.eq("resumeHash", a.tokenHash))
      .unique();
    if (
      !p ||
      !p.resumeSeed ||
      p.tokenExpiresAt <= Date.now() ||
      !p.sessionId ||
      p.environment !== (process.env.WALL_ENVIRONMENT ?? "test") ||
      p.paymentIssue ||
      !p.buyerEmail
    )
      return null;
    const takeover = await ctx.db.get(p.takeoverId);
    if (!takeover || takeover.blocked || takeover.status === "rejected")
      return null;
    return {
      takeoverId: p.takeoverId,
      sessionId: p.sessionId,
      requestKey: p.requestKey,
      name: takeover.displayName || takeover.domain,
      description: takeover.description,
      environment: p.environment,
    };
  },
});
