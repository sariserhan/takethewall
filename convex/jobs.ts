import { deferForAnalytics } from "./analytics";
import { scheduleDelivery } from "./deliverySchedule";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { checkoutResumeToken } from "../lib/owner-secrets";
import { policyFor } from "./emailPolicy";
import { emailAllowed } from "./emailPolicy";
import { senderForMail, legacyEmailSender } from "../lib/email-routing";
import { emailSenderFields } from "./rewardSchema";
import { notificationSettings } from "./adminNotifications";
import { weeklyOwnerEmail, finalOwnerEmail } from "../lib/owner-email";
import {
  ownerBaseUrl,
  ownerToken,
  ownerUnsubscribeToken,
} from "../lib/owner-secrets";
import { emailTemplate } from "../lib/email-template";
import {
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { jobKind, digestSnapshot, finalReportSnapshot } from "./schema";
import { limit } from "./model";
import { emailMessage, retryDelay } from "../lib/delivery";
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
    // Drain obsolete analytics jobs without making server-origin tracker requests.
    if (!j.kind.endsWith("_email")) {
      await ctx.db.patch(j._id, { state: "sent", lastError: undefined });
      return false;
    }
    if (j.kind === "replacement_email" && !j.finalReport) {
      const takeover = await ctx.db.get(j.takeoverId);
      if (!takeover?.activatedAt || takeover.replacedAt === undefined)
        return false;
      if (Date.now() <= takeover.replacedAt + 150_000) {
        await ctx.db.patch(j._id, { nextAt: takeover.replacedAt + 150_001 });
        await scheduleDelivery(
          ctx,
          "jobs",
          j._id,
          takeover.replacedAt + 150_001,
        );
        return false;
      }
      if (await deferForAnalytics(ctx, j.takeoverId)) {
        const nextAt = Date.now() + 30_000;
        await ctx.db.patch(j._id, { nextAt });
        await scheduleDelivery(ctx, "jobs", j._id, nextAt);
        return false;
      }
      const site = await ctx.db
        .query("siteStats")
        .withIndex("by_key", (q) => q.eq("key", "wall"))
        .unique();
      await ctx.db.patch(j._id, {
        finalReport: {
          displayName: takeover.displayName ?? takeover.domain,
          number:
            takeover.takeoverNumber === undefined
              ? null
              : takeover.takeoverNumber + (site?.numberingOffset ?? 0),
          impressions: takeover.impressions,
          uniqueVisitors: takeover.uniqueVisitors,
          clicks: takeover.clicks,
          activatedAt: takeover.activatedAt,
          replacedAt: takeover.replacedAt,
          snapshotAt: Date.now(),
          endReason: takeover.endReason ?? "purchase",
        },
      });
    }
    if (j.attempts >= 12) {
      await ctx.db.patch(j._id, {
        state: "failed",
        lastError: "Retry budget exhausted; inspect provider before replay",
      });
      return false;
    }
    if (j.kind.endsWith("_email")) await limit(ctx, "email:global", 50);
    await ctx.db.patch(j._id, {
      ...(j.kind.endsWith("_email")
        ? {
            sender:
              j.sender ??
              (j.attempts > 0 ? legacyEmailSender(false) : undefined) ??
              senderForMail(j),
          }
        : {}),
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
      deliveryAllowed: v.boolean(),
      id: v.id("jobs"),
      key: v.string(),
      kind: jobKind,
      sender: v.optional(emailSenderFields),
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
      resumeUrl: v.optional(v.string()),
      resumeExpiresAt: v.optional(v.number()),
      dashboardUrl: v.optional(v.string()),
      unsubscribeUrl: v.optional(v.string()),
      oneClickUnsubscribeUrl: v.optional(v.string()),
      digest: v.optional(digestSnapshot),
      finalReport: v.optional(finalReportSnapshot),
      adminNotice: v.optional(
        v.object({ subject: v.string(), body: v.string() }),
      ),
      digestAllowed: v.boolean(),
      adminNotificationEnabled: v.boolean(),
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
    const access =
      !["admin_takeover_email", "admin_payment_failure_email"].includes(
        j.kind,
      ) && j.kind.endsWith("_email")
        ? await ctx.db
            .query("ownerAccess")
            .withIndex("by_takeover", (q) => q.eq("takeoverId", t._id))
            .unique()
        : null;
    const site =
      j.kind === "weekly_digest_email"
        ? await ctx.db
            .query("siteStats")
            .withIndex("by_key", (q) => q.eq("key", "wall"))
            .unique()
        : null;
    const notifications = [
      "admin_takeover_email",
      "admin_payment_failure_email",
    ].includes(j.kind)
      ? await notificationSettings(ctx)
      : null;
    const destination = [
      "admin_takeover_email",
      "admin_payment_failure_email",
    ].includes(j.kind)
      ? (j.adminRecipient ?? "serhan.sari@yahoo.com")
      : j.recoveryToReceipt
        ? (p?.receiptEmail ?? "")
        : (p?.buyerEmail ?? "");
    const resumeAllowed =
      j.kind !== "checkout_resume_email" ||
      (!!p?.resumeSeed &&
        !p.paidAt &&
        !p.paymentIssue &&
        !t.blocked &&
        t.status === "pending" &&
        p.checkoutExpiresAt > Date.now() &&
        p.environment === (process.env.WALL_ENVIRONMENT ?? "test") &&
        !(await policyFor(ctx, destination))?.reason);
    const deliveryAllowed =
      !!destination &&
      resumeAllowed &&
      (await emailAllowed(ctx, destination, j.kind));
    return {
      deliveryAllowed,
      ...(j.kind === "checkout_resume_email" && p?.resumeSeed
        ? {
            resumeUrl: `${ownerBaseUrl()}/#resume=${checkoutResumeToken(p.resumeSeed)}`,
            resumeExpiresAt: p.checkoutExpiresAt,
          }
        : {}),
      adminNotificationEnabled: notifications?.enabled ?? false,
      ...(j.finalReport ? { finalReport: j.finalReport } : {}),
      ...(access && j.kind.endsWith("_email")
        ? {
            dashboardUrl: `${ownerBaseUrl()}/owner#token=${ownerToken(access.seed)}`,
            unsubscribeUrl: `${ownerBaseUrl()}/owner/unsubscribe#token=${ownerUnsubscribeToken(access.seed)}`,
            oneClickUnsubscribeUrl: `${ownerBaseUrl()}/api/owner/unsubscribe?token=${ownerUnsubscribeToken(access.seed)}`,
          }
        : {}),
      ...(j.digest ? { digest: j.digest } : {}),
      ...(j.adminNotice ? { adminNotice: j.adminNotice } : {}),
      digestAllowed:
        site?.currentTakeoverId === t._id &&
        t.status === "active" &&
        !t.blocked &&
        !!access?.weeklyDigestEnabled &&
        !p?.paymentIssue &&
        p?.environment === "production" &&
        process.env.WALL_ENVIRONMENT === "production" &&
        process.env.WEEKLY_OWNER_DIGEST_ENABLED !== "false",
      id: j._id,
      key: j.key,
      kind: j.kind,
      ...(j.sender ? { sender: j.sender } : {}),
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
      email: ["admin_takeover_email", "admin_payment_failure_email"].includes(
        j.kind,
      )
        ? (j.adminRecipient ?? "serhan.sari@yahoo.com")
        : j.kind === "owner_access_email"
          ? ((j.recoveryToReceipt ? p?.receiptEmail : p?.buyerEmail) ?? "")
          : (p?.buyerEmail ?? ""),
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
        ? {
            state: "sent",
            sentAt: Date.now(),
            lastError: undefined,
            adminNotice: undefined,
          }
        : {
            state: a.permanent || j.attempts >= 12 ? "failed" : "pending",
            nextAt: Date.now() + retryDelay(j.attempts),
            lastError: a.error ?? "Provider delivery failed",
          },
    );
    if (j.kind.endsWith("_email")) {
      const history = await ctx.db
        .query("emailHistory")
        .withIndex("by_key", (q) => q.eq("key", j.key))
        .unique();
      if (history)
        await ctx.db.patch(history._id, {
          state: a.ok
            ? history.state === "accepted"
              ? "accepted"
              : "skipped"
            : a.permanent || j.attempts >= 12
              ? "failed"
              : "pending",
          updatedAt: Date.now(),
        });
    }
    const updated = await ctx.db.get(a.id);
    if (updated?.state === "pending")
      await scheduleDelivery(ctx, "jobs", updated._id, updated.nextAt);
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
      ...(j.kind.endsWith("_email")
        ? {
            sender:
              j.sender ??
              (j.attempts > 0 ? legacyEmailSender(false) : undefined) ??
              senderForMail(j),
          }
        : {}),
      state: "pending",
      attempts: 0,
      nextAt: Date.now(),
    });
    await scheduleDelivery(ctx, "jobs", j._id);
    return null;
  },
});
export async function sendOne(ctx: ActionCtx, id: Id<"jobs">) {
  if (!(await ctx.runMutation(internal.jobs.claim, { id }))) return;
  try {
    const raw = await ctx.runQuery(internal.jobs.data, { id });
    if (!raw) return;
    if (
      !["admin_takeover_email", "admin_payment_failure_email"].includes(
        raw.kind,
      ) &&
      raw.kind.endsWith("_email") &&
      (process.env.CLAIM_TOKEN_SECRET?.length ?? 0) >= 32
    )
      await ctx.runMutation(internal.owners.ensureAccess, {
        takeoverId: raw.takeoverId,
      });
    const j = raw.kind.endsWith("_email")
      ? await ctx.runQuery(internal.jobs.data, { id })
      : raw;
    if (!j) return;
    let response: Response;
    let emailSubject = "";
    if (j.kind.endsWith("_email")) {
      if (
        !j.email ||
        !j.deliveryAllowed ||
        (["admin_takeover_email", "admin_payment_failure_email"].includes(
          j.kind,
        ) &&
          (!j.adminNotificationEnabled ||
            j.environment !== "production" ||
            process.env.WALL_ENVIRONMENT !== "production")) ||
        (j.kind === "weekly_digest_email" && !j.digestAllowed)
      ) {
        await ctx.runMutation(internal.jobs.finish, { id, ok: true });
        return;
      }
      if (!process.env.RESEND_API_KEY)
        throw new Error("Email provider is not configured");
      if (Date.now() - j.timestamp > 23 * 3600_000) {
        await ctx.runMutation(internal.jobs.finish, {
          id,
          ok: false,
          permanent: true,
          error:
            "Email delivery window elapsed; reconcile provider before manual delivery",
        });
        return;
      }
      if (j.kind === "owner_access_email" && !j.dashboardUrl)
        throw new Error("Owner access is not configured");
      const message =
        j.kind === "owner_access_email"
          ? {
              subject: "Your private owner dashboard",
              text: "Your private link shows your takeover performance and weekly email preferences. Keep this link private; use the share button inside the dashboard for a public link.",
            }
          : emailMessage(j);
      if (
        ["admin_takeover_email", "admin_payment_failure_email"].includes(
          j.kind,
        ) &&
        !j.adminNotice
      )
        throw new Error("Missing activation snapshot");
      const rendered =
        j.kind === "checkout_resume_email"
          ? emailTemplate(
              `${j.environment === "production" ? "" : "[TEST] "}Resume your Take The Wall checkout`,
              `You requested a link to continue your $3.99 checkout. Your saved content is ready. Payment has not been confirmed. Nothing is reserved or published until payment is verified. This checkout expires ${new Date(j.resumeExpiresAt!).toUTCString()}.`,
              {
                eyebrow: "YOUR SAVED CHECKOUT",
                cta: { label: "Resume checkout", url: j.resumeUrl! },
                footnote:
                  "Keep this link private. It opens your saved checkout. If you already paid, we’ll check your payment instead of asking you to pay again.",
              },
            )
          : ["admin_takeover_email", "admin_payment_failure_email"].includes(
                j.kind,
              )
            ? emailTemplate(j.adminNotice!.subject, j.adminNotice!.body, {
                eyebrow:
                  j.kind === "admin_payment_failure_email"
                    ? "PAYMENT NEEDS ATTENTION"
                    : "WALL TAKEOVER NOTIFICATION",
                cta: {
                  label: "Open admin dashboard",
                  url: ownerBaseUrl() + "/admin",
                },
                footnote:
                  j.kind === "admin_payment_failure_email"
                    ? "Payment failure snapshot. A later retry may have recovered publication; check Stripe status before acting."
                    : "Activation snapshot. Content and ownership may have changed since this notification.",
              })
            : j.kind === "replacement_email"
              ? finalOwnerEmail(j.finalReport!, j.dashboardUrl)
              : j.kind === "weekly_digest_email"
                ? weeklyOwnerEmail(
                    j.digest!,
                    j.dashboardUrl!,
                    j.unsubscribeUrl!,
                  )
                : emailTemplate(
                    message.subject,
                    message.text,
                    j.dashboardUrl
                      ? {
                          cta: {
                            label: "Open your private dashboard",
                            url: j.dashboardUrl,
                          },
                        }
                      : {},
                  );
      emailSubject = rendered.subject;
      await ctx.runMutation(internal.emailDirectory.track, {
        key: j.key,
        email: j.email,
        kind: j.kind,
        subject: rendered.subject,
        state: "sending",
        createdAt: j.timestamp,
      });
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": j.key,
        },
        body: JSON.stringify({
          ...(j.sender ?? senderForMail(j)),
          to: [j.email],
          ...rendered,
          ...(j.kind === "weekly_digest_email"
            ? {
                headers: {
                  "List-Unsubscribe": `<${j.oneClickUnsubscribeUrl}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                },
              }
            : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } else {
      await ctx.runMutation(internal.jobs.finish, { id, ok: true });
      return;
    }
    if (j.kind.endsWith("_email")) {
      const result = response.ok
        ? await response
            .clone()
            .json()
            .catch(() => null)
        : null;
      await ctx.runMutation(internal.emailDirectory.track, {
        key: j.key,
        email: j.email,
        kind: j.kind,
        subject: emailSubject,
        state: response.ok ? "accepted" : "failed",
        createdAt: j.timestamp,
        ...(typeof result?.id === "string" ? { providerId: result.id } : {}),
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
export const dispatch = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(internal.delivery.recover, {});
    return null;
  },
});
