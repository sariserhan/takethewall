import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, audit } from "./rewardModel";
import { limit } from "./model";
export const overview = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const states = ["failed", "pending", "sending"] as const;
    const jobs = (
      await Promise.all(
        states.map((state) =>
          ctx.db
            .query("jobs")
            .withIndex("by_state_nextAt", (q) => q.eq("state", state))
            .take(50),
        ),
      )
    ).flat();
    const mail = (
      await Promise.all(
        states.map((state) =>
          ctx.db
            .query("transactionalMail")
            .withIndex("by_state_next", (q) => q.eq("state", state))
            .take(50),
        ),
      )
    ).flat();
    const pending = await ctx.db
      .query("takeovers")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(50);
    const activations = await Promise.all(
      pending.map(async (t) => {
        const p = await ctx.db
          .query("purchases")
          .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
          .unique();
        return {
          id: t._id,
          name: t.displayName ?? t.domain,
          createdAt: t.createdAt,
          sessionId: p?.sessionId ?? null,
          environment: p?.environment ?? "unknown",
          expired: !!p?.expiredConfirmed,
          blocked: t.blocked,
        };
      }),
    );
    return JSON.stringify({
      emails: [
        ...jobs
          .filter((j) => j.kind.endsWith("_email"))
          .map((j) => ({
            id: j._id,
            queue: "jobs",
            kind: j.kind,
            state: j.state,
            attempts: j.attempts,
            createdAt: j.timestamp,
            nextAt: j.nextAt,
            error: j.lastError ?? null,
          })),
        ...mail.map((j) => ({
          id: j._id,
          queue: "mail",
          kind: j.kind,
          state: j.state,
          attempts: j.attempts,
          createdAt: j.createdAt,
          nextAt: j.nextAt,
          error: j.lastError ?? null,
        })),
      ].map((j) => ({
        ...j,
        retryBefore: j.createdAt + 23 * 3600_000,
      })),
      activations,
      limit: 50,
    });
  },
});
export const retry = mutation({
  args: {
    queue: v.union(v.literal("jobs"), v.literal("mail")),
    id: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    await limit(ctx, "delivery-retry:" + actor, 20, 3600_000);
    if (a.queue === "jobs") {
      const id = ctx.db.normalizeId("jobs", a.id);
      const j = id ? await ctx.db.get(id) : null;
      if (!j || !j.kind.endsWith("_email") || j.state !== "failed")
        throw new Error("Only failed email jobs can be retried.");
      if (Date.now() - j.timestamp >= 23 * 3600_000)
        throw new Error(
          "Reconcile this email in Resend; its safe retry window has expired.",
        );
      await ctx.db.patch(j._id, {
        state: "pending",
        attempts: 0,
        nextAt: Date.now(),
        lastError: undefined,
      });
    } else {
      const id = ctx.db.normalizeId("transactionalMail", a.id);
      const j = id ? await ctx.db.get(id) : null;
      if (!j || j.state !== "failed")
        throw new Error("Only failed emails can be retried.");
      if (Date.now() - j.createdAt >= 23 * 3600_000)
        throw new Error(
          "Reconcile this email in Resend; its safe retry window has expired.",
        );
      await ctx.db.patch(j._id, {
        state: "pending",
        attempts: 0,
        nextAt: Date.now(),
        lastError: undefined,
      });
    }
    await audit(ctx, actor, "EMAIL_RETRY_REQUESTED", a.id, { queue: a.queue });
    return null;
  },
});
export const payment = query({
  args: { takeoverId: v.id("takeovers") },
  returns: v.object({ sessionId: v.string(), takeoverId: v.id("takeovers") }),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const t = await ctx.db.get(a.takeoverId);
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", a.takeoverId))
      .unique();
    if (
      !t ||
      t.blocked ||
      t.status !== "pending" ||
      !p?.sessionId ||
      p.paymentIssue
    )
      throw new Error("This payment cannot be retried.");
    return { sessionId: p.sessionId, takeoverId: t._id };
  },
});
