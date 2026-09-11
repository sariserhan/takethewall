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
      to: v.string(),
      subject: v.string(),
      body: v.string(),
      key: v.string(),
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
    if (j.attempts >= 10 || Date.now() - j.createdAt > 23 * 3600_000) {
      await ctx.db.patch(j._id, {
        state: "failed",
        lastError: "Delivery window expired; reconcile before resending",
      });
      return null;
    }
    let body = j.body;
    if (j.claimId) {
      const c = await ctx.db.get(j.claimId);
      if (!c) {
        await ctx.db.patch(j._id, { state: "sent" });
        return null;
      }
      if (j.kind === "claim_link") {
        if (["ineligible", "expired"].includes(c.status)) {
          await ctx.db.patch(j._id, { state: "sent" });
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
          await ctx.db.patch(j._id, { state: "sent" });
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
          await ctx.db.patch(j._id, { state: "sent" });
          return null;
        }
        body = `Verification code: ${otpCode(c.otpSeed)}\n\n` + body;
      } else {
        if (j.kind === "chat" && c.lastWinnerReadAt >= c.lastAdminMessageAt) {
          await ctx.db.patch(j._id, { state: "sent" });
          return null;
        }
        body += `\n\nOpen your existing protected claim link to sign in. If you need a replacement link, contact support@takethewall.com.`;
      }
    }
    await ctx.db.patch(j._id, {
      state: "sending",
      attempts: j.attempts + 1,
      nextAt: Date.now() + 60_000,
    });
    return { to: j.to, subject: j.subject, body, key: j.key };
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("transactionalMail"),
    ok: v.boolean(),
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
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return null;
    const ids = await ctx.runQuery(internal.mail.due, {});
    for (const id of ids) {
      try {
        const j = await ctx.runMutation(internal.mail.prepare, { id });
        if (!j) continue;
        await transactionalEmail.send(j);
        await ctx.runMutation(internal.mail.finish, { id, ok: true });
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
