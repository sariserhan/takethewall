import { internalMutation } from "./_generated/server";
import { paymentStatus } from "../lib/payment-status";
import { senderForMail, legacyEmailSender } from "../lib/email-routing";
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
          paymentStatus: paymentStatus(t.kind, p),
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
        sender:
          j.sender ??
          (j.attempts > 0 ? legacyEmailSender(false) : undefined) ??
          senderForMail(j),
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
        sender:
          j.sender ??
          (j.attempts > 0 ? legacyEmailSender(true) : undefined) ??
          senderForMail(j),
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
  returns: v.object({
    sessionId: v.string(),
    takeoverId: v.id("takeovers"),
    environment: v.string(),
    canRecover: v.boolean(),
  }),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const t = await ctx.db.get(a.takeoverId);
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", a.takeoverId))
      .unique();
    if (!t || !p?.sessionId)
      throw new Error("No Stripe checkout exists for this record.");
    return {
      sessionId: p.sessionId,
      takeoverId: t._id,
      environment: p.environment,
      canRecover:
        !t.blocked && t.status === "pending" && !p.paymentIssue && !p.paidAt,
    };
  },
});

// Only the authenticated web server may record a retrieved Stripe result.
export const recordStripeCheck = internalMutation({
  args: {
    takeoverId: v.id("takeovers"),
    sessionId: v.string(),
    environment: v.string(),
    actor: v.string(),
    status: v.union(
      v.literal("paid"),
      v.literal("processing"),
      v.literal("expired"),
      v.literal("unpaid"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", a.takeoverId))
      .unique();
    if (
      !p ||
      p.sessionId !== a.sessionId ||
      p.environment !== a.environment ||
      p.environment !== (process.env.WALL_ENVIRONMENT ?? "test")
    )
      throw new Error("Payment reference mismatch");
    const now = Date.now();
    await ctx.db.patch(p._id, {
      stripeStatus: a.status,
      stripeCheckedAt: now,
      ...(a.status === "expired" && !p.paidAt
        ? { expiredConfirmed: true, cleanupAt: now + 48 * 3600_000 }
        : {}),
    });
    await audit(ctx, a.actor, "STRIPE_STATUS_CHECKED", a.takeoverId, {
      status: a.status,
      sessionId: a.sessionId,
      environment: a.environment,
    });
    return null;
  },
});
export const timeline = query({
  args: { takeoverId: v.id("takeovers") },
  returns: v.object({
    events: v.array(v.object({ at: v.number(), label: v.string() })),
    notes: v.array(v.string()),
  }),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const t = await ctx.db.get(a.takeoverId);
    if (!t) throw new Error("Takeover unavailable");
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", a.takeoverId))
      .unique();
    const events: { at: number; label: string }[] = [
      {
        at: t.createdAt,
        label:
          p && t.kind === "paid"
            ? "Checkout draft created"
            : "Placement created",
      },
    ];
    const notes = [];
    if (p?.sessionCreatedAt)
      events.push({
        at: p.sessionCreatedAt,
        label: "Stripe checkout attached",
      });
    else if (p?.sessionId)
      notes.push(
        "Stripe checkout exists; its attachment timestamp was not recorded for this older checkout.",
      );
    if (p?.paidAt)
      events.push({ at: p.paidAt, label: "Payment verified by the app" });
    if (t.activatedAt !== undefined)
      events.push({
        at: t.activatedAt,
        label: "Content published on the wall",
      });
    if (t.replacedAt !== undefined)
      events.push({ at: t.replacedAt, label: "Reign ended" });
    const checks = await ctx.db
      .query("adminAudit")
      .withIndex("by_target", (q) => q.eq("target", t._id))
      .order("desc")
      .take(50);
    for (const check of checks)
      if (check.action === "STRIPE_STATUS_CHECKED") {
        const data = JSON.parse(check.metadata);
        events.push({
          at: check.createdAt,
          label: "Stripe checked: " + data.status,
        });
      }
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_takeover_timestamp", (q) => q.eq("takeoverId", t._id))
      .order("desc")
      .take(50);
    for (const job of jobs) {
      if (!job.kind.endsWith("_email")) continue;
      const label =
        job.kind === "checkout_resume_email"
          ? "Resume email"
          : job.kind.replaceAll("_", " ");
      events.push({ at: job.timestamp, label: label + " queued" });
      const history = await ctx.db
        .query("emailHistory")
        .withIndex("by_key", (q) => q.eq("key", job.key))
        .unique();
      if (history?.sentAt)
        events.push({
          at: history.sentAt,
          label: label + " accepted by Resend",
        });
      else if (job.state === "sent")
        notes.push(
          label +
            ": queue finished; no provider acceptance timestamp recorded (may have been skipped).",
        );
      if (job.state === "failed") notes.push(label + ": delivery failed.");
      if (history?.providerId) {
        const delivery = await ctx.db
          .query("emailEvents")
          .withIndex("by_provider", (q) =>
            q.eq("providerId", history.providerId!),
          )
          .order("desc")
          .take(10);
        for (const e of delivery)
          if (
            ["email.delivered", "email.bounced", "email.complained"].includes(
              e.type,
            )
          )
            events.push({
              at: e.occurredAt,
              label: label + ": " + e.type.replace("email.", ""),
            });
      }
    }
    if (jobs.length === 50 || checks.length === 50)
      notes.push(
        "Showing up to 50 recent email jobs and 50 recent audit records for this takeover.",
      );
    return { events: events.sort((a, b) => a.at - b.at), notes };
  },
});
