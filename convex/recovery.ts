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
    if (job) await ctx.db.patch(job._id, { recoveryToReceipt: p.buyerEmail.toLowerCase() !== email });
    return null;
  },
});
