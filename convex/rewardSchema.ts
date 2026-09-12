import { defineTable } from "convex/server";
import { v } from "convex/values";
export const emailSenderFields = v.object({from:v.string(),reply_to:v.optional(v.string())});
export const claimStatus = v.union(
  ...(
    [
      "pending_claim",
      "code_verified",
      "information_required",
      "under_review",
      "additional_information_required",
      "approved",
      "paid",
      "ineligible",
      "expired",
    ] as const
  ).map((x) => v.literal(x)),
);
export const rewardStatus = v.union(
  ...(
    [
      "awaiting_successor",
      "pending_claim",
      "under_review",
      "approved",
      "paid",
    ] as const
  ).map((x) => v.literal(x)),
);
export const snapshot = v.object({
  displayName: v.string(),
  contentType: v.string(),
  linkType: v.string(),
  websiteUrl: v.string(),
  description: v.string(),
  logoStorageId: v.optional(v.id("_storage")),
  activatedAt: v.number(),
  replacedAt: v.optional(v.number()),
  impressions: v.number(),
  uniqueVisitors: v.number(),
  clicks: v.number(),
  statsFrozen: v.boolean(),
});
export const milestoneConfig = v.object({
  takeoverNumber: v.number(),
  rewardUsd: v.number(),
});
export const settingsValue = v.object({
  milestones: v.array(milestoneConfig),
  initialDays: v.number(),
  additionalDays: v.number(),
  rulesVersion: v.string(),
  rulesJson: v.string(),
  rewardsEnabled: v.boolean(),
  payoutsEnabled: v.boolean(),
  promotionEnabled: v.boolean(),
});
export const rewardTables = {
  rewardSettings: defineTable({
    key: v.literal("current"),
    value: settingsValue,
  }).index("by_key", ["key"]),
  rewardRules: defineTable({
    version: v.string(),
    hash: v.string(),
    json: v.string(),
    createdAt: v.number(),
  }).index("by_version", ["version"]),
  milestoneRewards: defineTable({
    milestoneNumber: v.number(),
    rewardUsd: v.number(),
    originalCandidateNumber: v.number(),
    candidateNumber: v.number(),
    status: rewardStatus,
    rulesVersion: v.string(),
    rulesHash: v.string(),
    initialDays: v.number(),
    additionalDays: v.number(),
    claimId: v.optional(v.id("rewardClaims")),
    winnerTakeoverId: v.optional(v.id("takeovers")),
    snapshot: v.optional(snapshot),
    outboundLinkEnabled: v.boolean(),
    awardedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    payoutStatus: v.optional(
      v.union(v.literal("pending"), v.literal("sent"), v.literal("confirmed")),
    ),
    payoutReference: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    payoutAdminId: v.optional(v.string()),
  })
    .index("by_number", ["milestoneNumber"])
    .index("by_status_candidate", ["status", "candidateNumber"]),
  rewardClaims: defineTable({
    rewardId: v.id("milestoneRewards"),
    takeoverId: v.id("takeovers"),
    takeoverNumber: v.number(),
    email: v.string(),
    status: claimStatus,
    deadlineAt: v.number(),
    createdAt: v.number(),
    legalName: v.optional(v.string()),
    country: v.optional(v.string()),
    region: v.optional(v.string()),
    dob: v.optional(v.string()),
    declaration: v.optional(v.string()),
    rulesAcceptedAt: v.optional(v.number()),
    submittedAt: v.optional(v.number()),
    requiredInformation: v.optional(v.string()),
    privateReason: v.optional(v.string()),
    tokenHash: v.optional(v.string()),
    tokenSeed: v.optional(v.string()),
    tokenVersion: v.number(),
    otpSeed: v.optional(v.string()),
    otpHash: v.optional(v.string()),
    otpExpiresAt: v.optional(v.number()),
    otpAttempts: v.number(),
    otpUsed: v.boolean(),
    lastWinnerReadAt: v.number(),
    lastAdminReadAt: v.number(),
    lastWinnerMessageAt: v.number(),
    lastAdminMessageAt: v.number(),
    notifyAt: v.optional(v.number()),
    notificationThrough: v.optional(v.number()),
  })
    .index("by_reward", ["rewardId"])
    .index("by_takeover", ["takeoverId"])
    .index("by_tokenHash", ["tokenHash"])
    .index("by_status_deadline", ["status", "deadlineAt"])
    .index("by_notifyAt", ["notifyAt"]),
  claimSessions: defineTable({
    hash: v.string(),
    claimId: v.id("rewardClaims"),
    expiresAt: v.number(),
    tokenVersion: v.number(),
  })
    .index("by_hash", ["hash"])
    .index("by_expiresAt", ["expiresAt"]),
  rewardMessages: defineTable({
    claimId: v.id("rewardClaims"),
    sender: v.union(
      v.literal("admin"),
      v.literal("winner"),
      v.literal("system"),
    ),
    adminId: v.optional(v.string()),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_claim_created", ["claimId", "createdAt"]),
  adminAudit: defineTable({
    actor: v.string(),
    action: v.string(),
    target: v.string(),
    metadata: v.string(),
    createdAt: v.number(),
    publicSummary: v.optional(v.string()),
  })
    .index("by_target", ["target"])
    .index("by_created", ["createdAt"]),
  supportTickets: defineTable({
    takeoverId: v.optional(v.id("takeovers")),
    reportedContent: v.optional(v.string()),
    name: v.string(),
    email: v.string(),
    topic: v.string(),
    message: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("spam"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status_updated", ["status", "updatedAt"]),
  supportMessages: defineTable({
    ticketId: v.id("supportTickets"),
    body: v.string(),
    adminId: v.string(),
    createdAt: v.number(),
  }).index("by_ticket", ["ticketId"]),
  transactionalMail: defineTable({
    sender:v.optional(emailSenderFields),
    subscriberId:v.optional(v.id("milestoneSubscribers")),
    milestoneNumber:v.optional(v.number()),
    key: v.string(),
    kind: v.string(),
    claimId: v.optional(v.id("rewardClaims")),
    ticketId: v.optional(v.id("supportTickets")),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    state: v.union(
      v.literal("pending"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    nextAt: v.number(),
    createdAt: v.number(),
    lastError: v.optional(v.string()),
    generation: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_state_next", ["state", "nextAt"]),
  auditCheckpoints: defineTable({
    fromNumber: v.number(),
    toNumber: v.number(),
    finalHash: v.string(),
    createdAt: v.number(),
    proofStorageId: v.optional(v.id("_storage")),
    state: v.union(
      v.literal("pending"),
      v.literal("submitted"),
      v.literal("confirmed"),
    ),
    nextAt: v.number(),
    attempts: v.number(),
  })
    .index("by_to", ["toNumber"])
    .index("by_state_next", ["state", "nextAt"]),
  claimDocuments: defineTable({
    claimId: v.id("rewardClaims"),
    request: v.string(),
    requestedAt: v.number(),
    storageId: v.optional(v.id("_storage")),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    uploadedAt: v.optional(v.number()),
    deleteAt: v.optional(v.number()),
    retentionOverride: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_claim", ["claimId"])
    .index("by_deleteAt", ["deleteAt"]),
};
