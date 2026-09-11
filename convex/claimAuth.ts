import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { sha } from "../lib/audit";
import { otpCode, otpDigest } from "../lib/claim-secrets";
import { audit, mail, requireClaim } from "./rewardModel";
import { limit } from "./model";
export const start = internalMutation({
  args: { token: v.string(), ipHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    await limit(ctx, "claim-otp-ip:" + a.ipHash, 6, 600_000);
    const c = await ctx.db
      .query("rewardClaims")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", sha(a.token)))
      .unique();
    if (!c) return false;
    await limit(ctx, "claim-otp:" + c._id, 3, 600_000);
    const seed =
      crypto.randomUUID() + crypto.randomUUID() + crypto.randomUUID();
    await ctx.db.patch(c._id, {
      otpSeed: seed,
      otpHash: otpDigest(c._id, otpCode(seed)),
      otpExpiresAt: Date.now() + 600_000,
      otpAttempts: 0,
      otpUsed: false,
    });
    await mail(ctx, {
      key: "otp:" + seed,
      kind: "otp",
      claimId: c._id,
      to: c.email,
      subject: "Your TakeTheWall verification code",
      body: "This single-use code expires in 10 minutes.",
      generation: c.tokenVersion,
    });
    return true;
  },
});
export const verify = internalMutation({
  args: {
    token: v.string(),
    code: v.string(),
    session: v.string(),
    ipHash: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    await limit(ctx, "claim-verify:" + a.ipHash, 20, 600_000);
    const c = await ctx.db
      .query("rewardClaims")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", sha(a.token)))
      .unique();
    if (
      !c ||
      c.otpUsed ||
      !c.otpExpiresAt ||
      c.otpExpiresAt <= Date.now() ||
      c.otpAttempts >= 5
    )
      return false;
    if (!/^\d{6}$/.test(a.code) || otpDigest(c._id, a.code) !== c.otpHash) {
      await ctx.db.patch(c._id, { otpAttempts: c.otpAttempts + 1 });
      return false;
    }
    await ctx.db.patch(c._id, {
      otpUsed: true,
      otpHash: undefined,
      otpSeed: undefined,
      ...(c.status === "pending_claim"
        ? { status: "code_verified" as const }
        : {}),
    });
    await ctx.db.insert("claimSessions", {
      hash: sha(a.session),
      claimId: c._id,
      expiresAt: Date.now() + 12 * 3600_000,
      tokenVersion: c.tokenVersion,
    });
    await audit(ctx, "winner", "CLAIM_CODE_VERIFIED", c._id);
    return true;
  },
});
export const logout = internalMutation({
  args: { session: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const s = await ctx.db
      .query("claimSessions")
      .withIndex("by_hash", (q) => q.eq("hash", sha(a.session)))
      .unique();
    if (s) await ctx.db.delete(s._id);
    return null;
  },
});
export const sessionValid = internalMutation({
  args: { session: v.string() },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    try {
      await requireClaim(ctx, a.session);
      return true;
    } catch {
      return false;
    }
  },
});
