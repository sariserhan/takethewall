import { scheduleRewardDeadline } from "./rewardSchedule";
import { scheduleDelivery } from "./deliverySchedule";
import { emailAllowed } from "./emailPolicy";
import { trackEmail } from "./emailDirectory";
import { numberingOffset } from "./numbering";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { MILESTONES, LEGAL_VERSION } from "../lib/config";
import { DEFAULT_RULES } from "../lib/reward-rules";
import { canonical, auditHash, sha } from "../lib/audit";
import { components, internal } from "./_generated/api";
export async function settings(ctx: QueryCtx) {
  const s = await ctx.db
    .query("rewardSettings")
    .withIndex("by_key", (q) => q.eq("key", "current"))
    .unique();
  return (
    s?.value ?? {
      dualRewardsEnabled: true,
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
    wallSubscriberId?: Id<"wallSubscribers">;
    wallTakeoverId?: Id<"takeovers">;
    wallTakeoverIds?: Id<"takeovers">[];
    subscriberId?: Id<"milestoneSubscribers">;
    milestoneNumber?: number;
  },
) {
  if (
    await ctx.db
      .query("transactionalMail")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .unique()
  )
    return;
  if (!a.to || !(await emailAllowed(ctx, a.to, a.kind))) return;
  await trackEmail(ctx, {
    key: a.key,
    email: a.to,
    kind: a.kind,
    subject: a.subject,
    state: "pending",
  });
  const deliveryId = await ctx.db.insert("transactionalMail", {
    ...a,
    state: "pending",
    attempts: 0,
    nextAt: Date.now(),
    createdAt: Date.now(),
  });
  await scheduleDelivery(ctx, "mail", deliveryId);
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
  if (reward.kind === "performance_traffic") {
    const rank = await ctx.db
      .query("performanceRanks")
      .withIndex("by_rank", (q) =>
        q.eq("rewardId", rewardId).eq("attempted", false),
      )
      .order("desc")
      .first();
    if (!rank || rank.referrals < 1) {
      await ctx.db.patch(rewardId, { status: "unawarded", claimId: undefined });
      await audit(
        ctx,
        "system",
        "PERFORMANCE_UNAWARDED",
        rewardId,
        {},
        "No eligible referral entrant remains.",
      );
      return;
    }
    await ctx.db.patch(rank._id, { attempted: true });
    number = rank.number;
    await ctx.db.patch(rewardId, { verifiedReferrals: rank.referrals });
  }
  const offset = await numberingOffset(ctx);
  const takeover = await ctx.db
    .query("takeovers")
    .withIndex("by_takeoverNumber", (q) =>
      q.eq("takeoverNumber", number - offset),
    )
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
  await scheduleRewardDeadline(
    ctx,
    Date.now() + reward.initialDays * 86400_000,
  );
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
  if (
    purchase?.paymentIssue ||
    takeover.blocked ||
    takeover.status === "rejected" ||
    !purchase?.buyerEmail
  ) {
    // Continue in bounded maintenance passes rather than recursive/unbounded cascade.
    await ctx.db.patch(claimId, {
      status: "ineligible",
      privateReason: purchase?.paymentIssue ?? "Purchase cannot be verified",
      deadlineAt: Date.now(),
    });
    await ctx.db.patch(rewardId, {
      status: "awaiting_successor",
      candidateNumber:
        reward.kind === "performance_traffic" ? number : number + 1,
      claimId: undefined,
    });
    if (reward.kind === "performance_traffic")
      await ctx.scheduler.runAfter(0, internal.rewards.maintain, {});
    await audit(
      ctx,
      "system",
      "REWARD_CASCADED",
      rewardId,
      {
        from: number,
        ...(reward.kind === "performance_traffic"
          ? { next: "next ranked eligible entrant" }
          : { to: number + 1 }),
      },
      `Takeover #${number} is ineligible.`,
    );
  } else
    await mail(ctx, {
      key: `claim:${claimId}:0`,
      kind: "claim_link",
      claimId,
      to: purchase.buyerEmail,
      subject: `Takeover #${number}: provisional ${reward.kind === "performance_traffic" ? "referral leader" : "milestone"} recipient`,
      body: `You are the provisional recipient of the $${reward.rewardUsd.toLocaleString("en-US")} ${reward.kind === "performance_traffic" ? "referral leader" : "milestone"} reward. Eligibility verification is required. Submit your initial claim by ${new Date(Date.now() + reward.initialDays * 86400_000).toUTCString()}.`,
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
        .first())
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
      if (s.dualRewardsEnabled) {
        const from = Math.max(
          1,
          ...s.milestones
            .filter((m) => m.takeoverNumber < number)
            .map((m) => m.takeoverNumber),
        );
        const cutoff = Date.now();
        const companion = await ctx.db.insert("milestoneRewards", {
          kind: "performance_traffic",
          milestoneNumber: number,
          rewardUsd: config.rewardUsd,
          originalCandidateNumber: from,
          candidateNumber: from,
          status: "selecting",
          rulesVersion: s.rulesVersion,
          rulesHash,
          initialDays: s.initialDays,
          additionalDays: s.additionalDays,
          outboundLinkEnabled: true,
          cohortFrom: from,
          cohortTo: number - 1,
          cutoffAt: cutoff,
        });
        await ctx.db.patch(id, {
          kind: "milestone_number",
          performanceRewardId: companion,
        });
        await ctx.db.insert("performanceSelections", {
          rewardId: companion,
          fromNumber: from,
          toNumber: number - 1,
          offset: await numberingOffset(ctx),
          cutoff,
          phase: "referrals",
          cursor: null,
        });
        await ctx.scheduler.runAfter(0, internal.performanceRewards.select, {
          rewardId: companion,
        });
      }
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
