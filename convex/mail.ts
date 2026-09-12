import { emailAllowed } from "./emailPolicy";
import { trackEmail } from "./emailDirectory";
import {
  wallConfirmation,
  wallUnsubscribe,
} from "../lib/wall-subscription-secrets";
import { senderForMail, legacyEmailSender } from "../lib/email-routing";
import { emailSenderFields } from "./rewardSchema";
import { alertConfirmation, alertUnsubscribe } from "../lib/alert-secrets";
import { ownerBaseUrl } from "../lib/owner-secrets";
import { getSite } from "./model";
import { settings } from "./rewardModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { linkToken, otpCode } from "../lib/claim-secrets";
import { sha } from "../lib/audit";
import { transactionalEmail } from "../lib/transactional-email";
import { audit } from "./rewardModel";
export const due = internalQuery({
  args: {},
  returns: v.array(v.id("transactionalMail")),
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("transactionalMail")
      .withIndex("by_state_next", (q) =>
        q.eq("state", "pending").lte("nextAt", now),
      )
      .take(15);
    const retry = await ctx.db
      .query("transactionalMail")
      .withIndex("by_state_next", (q) =>
        q.eq("state", "sending").lte("nextAt", now),
      )
      .take(5);
    return [...rows, ...retry].map((r) => r._id);
  },
});
export const prepare = internalMutation({
  args: { id: v.id("transactionalMail") },
  returns: v.union(
    v.null(),
    v.object({
      oneClickUnsubscribeUrl: v.optional(v.string()),
      sender: emailSenderFields,
      to: v.string(),
      subject: v.string(),
      body: v.string(),
      key: v.string(),
      presentation: v.optional(
        v.object({
          imageUrl: v.optional(v.string()),
          eyebrow: v.string(),
          cta: v.object({ label: v.string(), url: v.string() }),
          unsubscribeUrl: v.optional(v.string()),
          unsubscribeLabel: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    if (
      !j ||
      !["pending", "sending"].includes(j.state) ||
      j.nextAt > Date.now()
    )
      return null;
    const skip = async () => {
      await ctx.db.patch(j._id, { state: "sent", body: "" });
      await trackEmail(ctx, {
        key: j.key,
        email: j.to,
        kind: j.kind,
        subject: j.subject,
        state: "skipped",
        createdAt: j.createdAt,
      });
    };
    if (!j.to || !(await emailAllowed(ctx, j.to, j.kind))) {
      await skip();
      return null;
    }
    if (j.attempts >= 10 || Date.now() - j.createdAt > 23 * 3600_000) {
      await ctx.db.patch(j._id, {
        state: "failed",
        lastError: "Delivery window expired; reconcile before resending",
      });
      await trackEmail(ctx, {
        key: j.key,
        email: j.to,
        kind: j.kind,
        subject: j.subject,
        state: "failed",
        createdAt: j.createdAt,
      });
      return null;
    }
    let presentation:
      | {
          imageUrl?: string;
          eyebrow: string;
          cta: { label: string; url: string };
          unsubscribeUrl?: string;
          unsubscribeLabel?: string;
        }
      | undefined;
    let oneClickUnsubscribeUrl: string | undefined;
    if (j.wallSubscriberId) {
      const subscriber = await ctx.db.get(j.wallSubscriberId);
      const takeover = j.wallTakeoverId
        ? await ctx.db.get(j.wallTakeoverId)
        : null;
      const included = await Promise.all(
        (j.wallTakeoverIds ?? []).map((id) => ctx.db.get(id)),
      );
      const allowed =
        included.every((t) => t && !t.blocked && t.status !== "rejected") &&
        !!subscriber?.email &&
        subscriber.generation === j.generation &&
        (j.kind === "wall_confirm"
          ? !subscriber.active && subscriber.expiresAt > Date.now()
          : subscriber.active &&
            process.env.WALL_ENVIRONMENT === "production" &&
            !!takeover &&
            !takeover.blocked &&
            takeover.status !== "rejected");
      if (!allowed) {
        await skip();
        return null;
      }
      const base = ownerBaseUrl();
      presentation =
        j.kind === "wall_confirm"
          ? {
              eyebrow: "CONFIRM YOUR SUBSCRIPTION",
              cta: {
                label: "Confirm wall-change emails",
                url:
                  base +
                  "/wall-emails#confirm=" +
                  wallConfirmation(subscriber!.seed),
              },
            }
          : {
              eyebrow:
                j.kind === "wall_daily"
                  ? "YOUR DAILY WALL UPDATE"
                  : "A NEW OWNER TOOK THE WALL",
              cta: { label: "Visit the live wall", url: base },
              ...(takeover?.publicTakeoverId
                ? {
                    imageUrl:
                      base + "/takeover/" + takeover.publicTakeoverId + "/card",
                  }
                : {}),
              unsubscribeUrl:
                base +
                "/wall-emails#unsubscribe=" +
                wallUnsubscribe(subscriber!.seed),
              unsubscribeLabel: "Manage or unsubscribe from wall-change emails",
            };
      if (j.kind !== "wall_confirm")
        oneClickUnsubscribeUrl =
          base +
          "/api/wall-subscriptions/unsubscribe?token=" +
          wallUnsubscribe(subscriber!.seed);
    }
    if (j.subscriberId) {
      const subscriber = await ctx.db.get(j.subscriberId);
      let allowed =
        !!subscriber?.email && j.generation === subscriber?.generation;
      if (j.kind === "milestone_confirm")
        allowed =
          allowed && !subscriber!.active && subscriber!.expiresAt > Date.now();
      else {
        const config = await settings(ctx),
          site = await getSite(ctx);
        allowed =
          allowed &&
          !!subscriber?.active &&
          process.env.WALL_ENVIRONMENT === "production" &&
          config.rewardsEnabled &&
          config.promotionEnabled &&
          !!j.milestoneNumber &&
          config.milestones.some(
            (m) => m.takeoverNumber === j.milestoneNumber,
          ) &&
          site.totalTakeovers + (site.numberingOffset ?? 0) <
            j.milestoneNumber!;
      }
      if (!allowed) {
        await skip();
        return null;
      }
      presentation =
        j.kind === "milestone_confirm"
          ? {
              eyebrow: "CONFIRM YOUR ALERTS",
              cta: {
                label: "Confirm milestone alerts",
                url:
                  ownerBaseUrl() +
                  "/alerts#confirm=" +
                  alertConfirmation(subscriber!.seed),
              },
            }
          : {
              eyebrow: "A MILESTONE IS APPROACHING",
              cta: { label: "Check the live wall", url: ownerBaseUrl() },
              unsubscribeUrl:
                ownerBaseUrl() +
                "/alerts#unsubscribe=" +
                alertUnsubscribe(subscriber!.seed),
              unsubscribeLabel: "Unsubscribe from milestone alerts",
            };
    }
    let body = j.body;
    if (j.claimId) {
      const c = await ctx.db.get(j.claimId);
      if (!c) {
        await skip();
        return null;
      }
      if (j.kind === "claim_link") {
        if (["ineligible", "expired"].includes(c.status)) {
          await skip();
          return null;
        }
        let seed = c.tokenSeed;
        if (j.generation === undefined) {
          seed =
            crypto.randomUUID() + crypto.randomUUID() + crypto.randomUUID();
          const generation = c.tokenVersion + 1;
          await ctx.db.patch(c._id, {
            tokenSeed: seed,
            tokenHash: sha(linkToken(seed)),
            tokenVersion: generation,
            otpUsed: true,
            otpHash: undefined,
            otpSeed: undefined,
          });
          await ctx.db.patch(j._id, { generation });
        } else if (j.generation !== c.tokenVersion) {
          await skip();
          return null;
        }
        if (!seed) throw new Error("Claim link unavailable");
        body += `\n\nClaim your reward: ${(process.env.SITE_URL ?? "https://takethewall.com").replace(/\/$/, "")}/reward/claim/${linkToken(seed)}\nA fresh email code is required to sign in.`;
      } else if (j.kind === "otp") {
        if (
          j.generation !== c.tokenVersion ||
          c.otpUsed ||
          !c.otpSeed ||
          !c.otpExpiresAt ||
          c.otpExpiresAt <= Date.now() ||
          j.key !== "otp:" + c.otpSeed
        ) {
          await skip();
          return null;
        }
        body = `Verification code: ${otpCode(c.otpSeed)}\n\n` + body;
      } else {
        if (j.kind === "chat" && c.lastWinnerReadAt >= c.lastAdminMessageAt) {
          await skip();
          return null;
        }
        body += `\n\nOpen your existing protected claim link to sign in. If you need a replacement link, contact support@takethewall.com.`;
      }
    }
    const sender =
      j.sender ??
      (j.attempts > 0 ? legacyEmailSender(true) : undefined) ??
      senderForMail(j);
    await ctx.db.patch(j._id, {
      sender,
      state: "sending",
      attempts: j.attempts + 1,
      nextAt: Date.now() + 60_000,
    });
    await trackEmail(ctx, {
      key: j.key,
      email: j.to,
      kind: j.kind,
      subject: j.subject,
      state: "sending",
      createdAt: j.createdAt,
    });
    return {
      ...(oneClickUnsubscribeUrl ? { oneClickUnsubscribeUrl } : {}),
      sender,
      to: j.to,
      subject: j.subject,
      body,
      key: j.key,
      ...(presentation ? { presentation } : {}),
    };
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("transactionalMail"),
    ok: v.boolean(),
    providerId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    if (!j || j.state === "sent") return null;
    await ctx.db.patch(
      j._id,
      a.ok
        ? { state: "sent", body: "", lastError: undefined }
        : {
            state: j.attempts >= 10 ? "failed" : "pending",
            nextAt: Date.now() + Math.min(3600_000, 30_000 * 2 ** j.attempts),
            lastError: a.error ?? "Email unavailable",
          },
    );
    await trackEmail(ctx, {
      key: j.key,
      email: j.to,
      kind: j.kind,
      subject: j.subject,
      state: a.ok ? "accepted" : j.attempts >= 10 ? "failed" : "pending",
      createdAt: j.createdAt,
      providerId: a.providerId,
    });
    if (a.ok && j.claimId)
      await audit(
        ctx,
        "system",
        j.kind === "claim_link" ? "CLAIM_EMAIL_SENT" : "EMAIL_SENT",
        j.claimId,
        { kind: j.kind },
      );
    return null;
  },
});
export const dispatch = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!process.env.RESEND_API_KEY) return null;
    const ids = await ctx.runQuery(internal.mail.due, {});
    for (const id of ids) {
      try {
        const j = await ctx.runMutation(internal.mail.prepare, { id });
        if (!j) continue;
        const providerId = await transactionalEmail.send(j);
        await ctx.runMutation(internal.mail.finish, {
          id,
          ok: true,
          providerId,
        });
      } catch {
        await ctx.runMutation(internal.mail.finish, {
          id,
          ok: false,
          error: "Email unavailable or configuration incomplete",
        });
      }
    }
    return null;
  },
});
