import { numberingOffset } from "./numbering";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { MILESTONES, LEGAL_VERSION } from "../lib/config";
import { DEFAULT_RULES } from "../lib/reward-rules";
import { canonical, auditHash, sha } from "../lib/audit";
import { components } from "./_generated/api";
export async function settings(ctx: QueryCtx) {
  const s = await ctx.db
    .query("rewardSettings")
    .withIndex("by_key", (q) => q.eq("key", "current"))
    .unique();
  return (
    s?.value ?? {
      milestones: MILESTONES,
      initialDays: 7,
      additionalDays: 7,
      rulesVersion: LEGAL_VERSION,
      rulesJson: canonical(DEFAULT_RULES),
      rewardsEnabled: process.env.MILESTONE_REWARDS_ENABLED === "true",
      payoutsEnabled: process.env.MILESTONE_PAYOUTS_ENABLED === "true",
      promotionEnabled:
        process.env.MILESTONE_PUBLIC_PROMOTION_ENABLED === "true",
    }
  );
}
export async function audit(
  ctx: MutationCtx,
  actor: string,
  action: string,
  target: string,
  metadata: unknown = {},
  publicSummary?: string,
) {
  await ctx.db.insert("adminAudit", {
    actor,
    action,
    target,
    metadata: canonical(metadata),
    createdAt: Date.now(),
    ...(publicSummary ? { publicSummary } : {}),
  });
}
export async function mail(
  ctx: MutationCtx,
  a: {
    key: string;
    kind: string;
    to: string;
    subject: string;
    body: string;
    claimId?: Id<"rewardClaims">;
    ticketId?: Id<"supportTickets">;
    generation?: number;
  },
) {
  if (
    await ctx.db
      .query("transactionalMail")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .unique()
  )
    return;
  await ctx.db.insert("transactionalMail", {
    ...a,
    state: "pending",
    attempts: 0,
    nextAt: Date.now(),
    createdAt: Date.now(),
  });
}
export async function systemMessage(
  ctx: MutationCtx,
  claimId: Id<"rewardClaims">,
  body: string,
) {
  await ctx.db.insert("rewardMessages", {
    claimId,
    body,
    sender: "system",
    createdAt: Date.now(),
  });
}
export async function createCandidate(
  ctx: MutationCtx,
  rewardId: Id<"milestoneRewards">,
  number: number,
) {
  const reward = (await ctx.db.get(rewardId))!;
  const offset = await numberingOffset(ctx);
  const takeover = await ctx.db
    .query("takeovers")
    .withIndex("by_takeoverNumber", (q) => q.eq("takeoverNumber", number - offset))
    .unique();
  if (!takeover) {
    await ctx.db.patch(rewardId, {
      candidateNumber: number,
      status: "awaiting_successor",
      claimId: undefined,
    });
    return;
  }
  const purchase = await ctx.db
    .query("purchases")
    .withIndex("by_takeoverId", (q) => q.eq("takeoverId", takeover._id))
    .unique();
  const claimId = await ctx.db.insert("rewardClaims", {
    rewardId,
    takeoverId: takeover._id,
    takeoverNumber: number,
    email: purchase?.buyerEmail ?? "",
    status: "pending_claim",
    deadlineAt: Date.now() + reward.initialDays * 86400_000,
    createdAt: Date.now(),
    tokenVersion: 0,
    otpAttempts: 0,
    otpUsed: true,
    lastWinnerReadAt: 0,
    lastAdminReadAt: 0,
    lastWinnerMessageAt: 0,
    lastAdminMessageAt: 0,
  });
  await ctx.db.patch(rewardId, {
    candidateNumber: number,
    status: "pending_claim",
    claimId,
  });
  await audit(
    ctx,
    "system",
    "PROVISIONAL_WINNER_CREATED",
    rewardId,
    { number },
    `Takeover #${number} is provisional.`,
  );
  await systemMessage(ctx, claimId, "Provisional reward claim opened.");
  if (purchase?.paymentIssue || takeover.blocked || !purchase?.buyerEmail) {
    // Continue in bounded maintenance passes rather than recursive/unbounded cascade.
    await ctx.db.patch(claimId, {
      status: "ineligible",
      privateReason: purchase?.paymentIssue ?? "Purchase cannot be verified",
      deadlineAt: Date.now(),
    });
    await ctx.db.patch(rewardId, {
      status: "awaiting_successor",
      candidateNumber: number + 1,
      claimId: undefined,
    });
    await audit(
      ctx,
      "system",
      "REWARD_CASCADED",
      rewardId,
      { from: number, to: number + 1 },
      `Takeover #${number} is ineligible.`,
    );
  } else
    await mail(ctx, {
      key: `claim:${claimId}:0`,
      kind: "claim_link",
      claimId,
      to: purchase.buyerEmail,
      subject: `Takeover #${number}: provisional milestone recipient`,
      body: `You are the provisional recipient of the $${reward.rewardUsd.toLocaleString("en-US")} milestone reward. Eligibility verification is required. Submit your initial claim by ${new Date(Date.now() + reward.initialDays * 86400_000).toUTCString()}.`,
    });
}
export async function onActivation(ctx: MutationCtx, number: number) {
  const s = await settings(ctx);
  if (s.rewardsEnabled) {
    const config = s.milestones.find((m) => m.takeoverNumber === number);
    if (
      config &&
      !(await ctx.db
        .query("milestoneRewards")
        .withIndex("by_number", (q) => q.eq("milestoneNumber", number))
        .unique())
    ) {
      const rulesHash = sha(s.rulesJson);
      const rules = await ctx.db
        .query("rewardRules")
        .withIndex("by_version", (q) => q.eq("version", s.rulesVersion))
        .unique();
      if (rules && rules.hash !== rulesHash)
        throw new Error("Rules version cannot be modified");
      if (!rules)
        await ctx.db.insert("rewardRules", {
          version: s.rulesVersion,
          hash: rulesHash,
          json: s.rulesJson,
          createdAt: Date.now(),
        });
      const id = await ctx.db.insert("milestoneRewards", {
        milestoneNumber: number,
        rewardUsd: config.rewardUsd,
        originalCandidateNumber: number,
        candidateNumber: number,
        status: "pending_claim",
        rulesVersion: s.rulesVersion,
        rulesHash,
        initialDays: s.initialDays,
        additionalDays: s.additionalDays,
        outboundLinkEnabled: true,
      });
      await audit(
        ctx,
        "system",
        "MILESTONE_REACHED",
        id,
        { number },
        `Milestone #${number} reached.`,
      );
      await createCandidate(ctx, id, number);
    }
  }
  // Existing reward obligations survive disabling creation of new rewards.
  const awaiting = await ctx.db
    .query("milestoneRewards")
    .withIndex("by_status_candidate", (q) =>
      q.eq("status", "awaiting_successor").eq("candidateNumber", number),
    )
    .take(100);
  for (const r of awaiting) await createCandidate(ctx, r._id, number);
}
export async function requireAdmin(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!identity) throw new Error("Administrator access required");
  let email = identity.email;
  let verified = identity.emailVerified === true;
  if (typeof identity.sessionId === "string") {
    // Resolve Better Auth's current verified user rather than depending on
    // optional email claims cached in an already-issued JWT.
    const session = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "session",
      where: [
        { field: "_id", value: identity.sessionId },
        { field: "userId", value: identity.subject },
        { field: "expiresAt", operator: "gt", value: Date.now() },
      ],
    });
    if (!session) throw new Error("Administrator access required");
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "_id", value: identity.subject }],
    });
    if (!user) throw new Error("Administrator access required");
    email = user.email;
    verified = user.emailVerified === true;
  }
  if (
    !ids.includes(identity.subject) &&
    !(verified && email && emails.includes(email.toLowerCase()))
  )
    throw new Error("Administrator access required");
  return identity.subject;
}
export async function requireClaim(ctx: QueryCtx, session: string) {
  const s = await ctx.db
    .query("claimSessions")
    .withIndex("by_hash", (q) => q.eq("hash", sha(session)))
    .unique();
  if (!s || s.expiresAt <= Date.now()) throw new Error("Claim session expired");
  const claim = await ctx.db.get(s.claimId);
  if (!claim || claim.tokenVersion !== s.tokenVersion)
    throw new Error("Claim session expired");
  return claim;
}
export const publicContentHash = auditHash;
