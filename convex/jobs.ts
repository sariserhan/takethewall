import {
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { jobKind } from "./schema";
import { limit } from "./model";
import { emailMessage, retryDelay, visitorPingPayload } from "../lib/delivery";
export const claim = internalMutation({
  args: { id: v.id("jobs") },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    if (
      !j ||
      j.state === "sent" ||
      j.state === "failed" ||
      j.nextAt > Date.now()
    )
      return false;
    if (j.attempts >= 12) {
      await ctx.db.patch(j._id, {
        state: "failed",
        lastError: "Retry budget exhausted; inspect provider before replay",
      });
      return false;
    }
    if (j.kind.endsWith("_email")) await limit(ctx, "email:global", 50);
    await ctx.db.patch(j._id, {
      state: "sending",
      attempts: j.attempts + 1,
      nextAt: Date.now() + 60_000,
    });
    return true;
  },
});
export const due = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.id("jobs")),
  handler: async (ctx, a) => {
    const pending = await ctx.db
      .query("jobs")
      .withIndex("by_state_nextAt", (q) =>
        q.eq("state", "pending").lte("nextAt", a.now),
      )
      .take(20);
    const stuck = await ctx.db
      .query("jobs")
      .withIndex("by_state_nextAt", (q) =>
        q.eq("state", "sending").lte("nextAt", a.now),
      )
      .take(10);
    return [...pending, ...stuck].map((j) => j._id);
  },
});
export const data = internalQuery({
  args: { id: v.id("jobs") },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("jobs"),
      key: v.string(),
      kind: jobKind,
      takeoverId: v.id("takeovers"),
      deliveryId: v.string(),
      visitorHash: v.optional(v.string()),
      pageId: v.optional(v.string()),
      region: v.optional(v.string()),
      timestamp: v.number(),
      attempts: v.number(),
      domain: v.string(),
      websiteUrl: v.string(),
      activatedAt: v.number(),
      replacedAt: v.optional(v.number()),
      endReason: v.optional(v.string()),
      email: v.string(),
      environment: v.string(),
    }),
  ),
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    if (!j) return null;
    const t = await ctx.db.get(j.takeoverId);
    if (!t) return null;
    const p = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
      .unique();
    return {
      id: j._id,
      key: j.key,
      kind: j.kind,
      takeoverId: j.takeoverId,
      deliveryId: j.deliveryId,
      ...(j.visitorHash
        ? { visitorHash: j.visitorHash, pageId: j.pageId, region: j.region }
        : {}),
      timestamp: j.timestamp,
      attempts: j.attempts,
      domain: t.displayName ?? t.domain,
      websiteUrl: t.websiteUrl,
      activatedAt: t.activatedAt ?? 0,
      ...(t.replacedAt !== undefined ? { replacedAt: t.replacedAt } : {}),
      ...(t.endReason ? { endReason: t.endReason } : {}),
      email: p?.buyerEmail ?? "",
      environment: p?.environment ?? process.env.WALL_ENVIRONMENT ?? "test",
    };
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("jobs"),
    ok: v.boolean(),
    error: v.optional(v.string()),
    permanent: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    if (!j) return null;
    await ctx.db.patch(
      j._id,
      a.ok
        ? { state: "sent", sentAt: Date.now(), lastError: undefined }
        : {
            state: a.permanent || j.attempts >= 12 ? "failed" : "pending",
            nextAt: Date.now() + retryDelay(j.attempts),
            lastError: a.error ?? "Provider delivery failed",
          },
    );
    return null;
  },
});
export const replay = internalMutation({
  args: { id: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    if (!j || j.state !== "failed")
      throw new Error("Only failed jobs may be replayed");
    if (j.kind.endsWith("_email") && Date.now() - j.timestamp > 23 * 3600_000)
      throw new Error(
        "Email idempotency window elapsed. Reconcile in Resend before any manual send.",
      );
    await ctx.db.patch(j._id, {
      state: "pending",
      attempts: 0,
      nextAt: Date.now(),
    });
    return null;
  },
});
export const dispatch = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ids = await ctx.runQuery(internal.jobs.due, { now: Date.now() });
    for (const id of ids) {
      if (!(await ctx.runMutation(internal.jobs.claim, { id }))) continue;
      const j = await ctx.runQuery(internal.jobs.data, { id });
      if (!j) continue;
      try {
        let response: Response;
        if (j.kind.endsWith("_email")) {
          if (!j.email) {
            await ctx.runMutation(internal.jobs.finish, { id, ok: true });
            continue;
          }
          if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM)
            throw new Error("Email provider is not configured");
          if (Date.now() - j.timestamp > 23 * 3600_000) {
            await ctx.runMutation(internal.jobs.finish, {
              id,
              ok: false,
              permanent: true,
              error:
                "Email delivery window elapsed; reconcile provider before manual delivery",
            });
            continue;
          }
          response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
              "Idempotency-Key": j.key,
            },
            body: JSON.stringify({
              from: process.env.RESEND_FROM,
              to: [j.email],
              ...emailMessage(j),
            }),
            signal: AbortSignal.timeout(10_000),
          });
        } else {
          if (
            j.environment !== "production" ||
            process.env.PUBLIC_METRICS_ENABLED !== "true"
          ) {
            await ctx.runMutation(internal.jobs.finish, { id, ok: true });
            continue;
          }
          const siteKey = process.env.VISITORPING_SITE_KEY;
          if (!siteKey || !/^vp_[A-HJ-NP-Z2-9]{8}$/.test(siteKey))
            throw new Error("VisitorPing site key is not configured");
          response = await fetch("https://ingest.visitorping.com/e", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: "https://takethewall.com",
              "User-Agent": "TakeTheWall/1.0",
            },
            body: JSON.stringify(
              visitorPingPayload({ siteKey, ...j, event: j.kind }),
            ),
            signal: AbortSignal.timeout(10_000),
          });
        }
        if (!response.ok) {
          await ctx.runMutation(internal.jobs.finish, {
            id,
            ok: false,
            error: `Provider HTTP ${response.status}`,
            permanent:
              response.status >= 400 &&
              response.status < 500 &&
              ![408, 409, 429].includes(response.status),
          });
        } else await ctx.runMutation(internal.jobs.finish, { id, ok: true });
      } catch {
        await ctx.runMutation(internal.jobs.finish, {
          id,
          ok: false,
          error: "Provider unavailable or configuration missing",
        });
      }
    }
    return null;
  },
});
