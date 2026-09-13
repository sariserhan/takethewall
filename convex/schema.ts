import { demoValues, demoPresentation } from "./demoValues";
import { rewardTables, emailSenderFields } from "./rewardSchema";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export const ownerFeedback = v.union(
  v.literal("yes"),
  v.literal("no"),
  v.literal("unsure"),
);
export const kind = v.union(
  v.literal("paid"),
  v.literal("admin_counted"),
  v.literal("admin_placement"),
  v.literal("initial_house"),
  v.literal("moderation_restoration"),
);
export const status = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("replaced"),
  v.literal("rejected"),
);
export const jobKind = v.union(
  v.literal("activation_email"),
  v.literal("admin_takeover_email"),
  v.literal("admin_payment_failure_email"),
  v.literal("owner_access_email"),
  v.literal("checkout_resume_email"),
  v.literal("weekly_digest_email"),
  v.literal("replacement_email"),
  v.literal("checkout_completed"),
  v.literal("takeover_activated"),
  v.literal("wall_impression"),
  v.literal("wall_owner_link_click"),
  v.literal("take_wall_clicked"),
  v.literal("checkout_started"),
);
export const visitorPingSnapshot = v.object({
  takeoverId: v.id("takeovers"),
  from: v.string(),
  to: v.string(),
  fetchedAt: v.number(),
  impressions: v.number(),
  uniqueVisitors: v.number(),
  clicks: v.number(),
});
export const digestSnapshot = v.object({
  displayName: v.string(),
  number: v.union(v.number(), v.null()),
  impressions: v.number(),
  uniqueVisitors: v.number(),
  clicks: v.number(),
  activatedAt: v.number(),
  snapshotAt: v.number(),
});
export const editableContent = v.object({
  contentType: v.string(),
  linkType: v.string(),
  websiteUrl: v.string(),
  domain: v.string(),
  displayName: v.string(),
  description: v.string(),
  morseMessage: v.optional(v.string()),
  logoStorageId: v.optional(v.id("_storage")),
});
export const finalReportSnapshot = v.object({
  ...digestSnapshot.fields,
  replacedAt: v.number(),
  endReason: v.string(),
});
export default defineSchema({
  deliveryClock: defineTable({
    key: v.literal("email"),
    nextAt: v.number(),
  }).index("by_key", ["key"]),
  analyticsBatches: defineTable({
    takeoverId: v.id("takeovers"),
    date: v.string(),
    shard: v.number(),
    impressions: v.number(),
    uniqueVisitors: v.number(),
    clicks: v.number(),
    siteVisitors: v.number(),
    dailyVisitors: v.number(),
    funnelVisits: v.number(),
    regions: v.array(
      v.object({
        code: v.string(),
        impressions: v.number(),
        uniqueVisitors: v.number(),
      }),
    ),
  }).index("by_bucket", ["takeoverId", "date", "shard"]),
  emailPolicies: defineTable({
    emailHash: v.string(),
    reason: v.optional(
      v.union(
        v.literal("hard_bounce"),
        v.literal("spam_complaint"),
        v.literal("admin_unsubscribe"),
      ),
    ),
    stoppedAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletionState: v.optional(
      v.union(v.literal("pending"), v.literal("complete")),
    ),
    deletionSource: v.optional(v.number()),
    deletionCursor: v.optional(v.union(v.string(), v.null())),
  })
    .index("by_email", ["emailHash"])
    .index("by_deletion", ["deletionState"]),
  wallSubscribers: defineTable({
    confirmedAt: v.optional(v.number()),
    unsubscribedAt: v.optional(v.number()),
    email: v.string(),
    emailHash: v.string(),
    seed: v.string(),
    confirmHash: v.string(),
    unsubscribeHash: v.string(),
    active: v.boolean(),
    frequency: v.union(v.literal("every"), v.literal("daily")),
    generation: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
    lastSequence: v.number(),
    nextAt: v.number(),
  })
    .index("by_email", ["emailHash"])
    .index("by_confirm", ["confirmHash"])
    .index("by_unsubscribe", ["unsubscribeHash"])
    .index("by_due", ["active", "nextAt"])
    .index("by_frequency_due", ["active", "frequency", "nextAt"])
    .index("by_sequence", ["active", "frequency", "lastSequence"]),
  emailContacts: defineTable({
    email: v.string(),
    emailHash: v.string(),
    sources: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["emailHash"])
    .index("by_address", ["email"]),
  emailHistory: defineTable({
    key: v.string(),
    email: v.string(),
    emailHash: v.string(),
    kind: v.string(),
    subject: v.string(),
    state: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
    providerId: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_email", ["emailHash", "createdAt"])
    .index("by_provider", ["providerId"]),
  emailEvents: defineTable({
    bounceType: v.optional(v.string()),
    eventId: v.string(),
    providerId: v.string(),
    type: v.string(),
    occurredAt: v.number(),
  })
    .index("by_provider_type", ["providerId", "type", "bounceType"])
    .index("by_event", ["eventId"])
    .index("by_provider", ["providerId", "occurredAt"]),
  emailIndexProgress: defineTable({
    source: v.string(),
    cursor: v.union(v.string(), v.null()),
    done: v.boolean(),
  }).index("by_source", ["source"]),
  milestoneSubscribers: defineTable({
    confirmedAt: v.optional(v.number()),
    unsubscribedAt: v.optional(v.number()),
    email: v.string(),
    emailHash: v.string(),
    seed: v.string(),
    confirmHash: v.string(),
    unsubscribeHash: v.string(),
    active: v.boolean(),
    generation: v.number(),
    expiresAt: v.number(),
    lastNotified: v.number(),
    createdAt: v.number(),
  })
    .index("by_email", ["emailHash"])
    .index("by_confirm", ["confirmHash"])
    .index("by_unsubscribe", ["unsubscribeHash"])
    .index("by_active_milestone", ["active", "lastNotified"])
    .index("by_active_expiry", ["active", "expiresAt"]),
  notificationSettings: defineTable({
    key: v.literal("current"),
    enabled: v.boolean(),
    recipient: v.string(),
    revision: v.number(),
  }).index("by_key", ["key"]),
  ownerAccess: defineTable({
    feedback: v.optional(ownerFeedback),
    feedbackAt: v.optional(v.number()),
    takeoverId: v.id("takeovers"),
    seed: v.string(),
    tokenHash: v.string(),
    unsubscribeHash: v.string(),
    weeklyDigestEnabled: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_takeover", ["takeoverId"])
    .index("by_token", ["tokenHash"])
    .index("by_unsubscribe", ["unsubscribeHash"])
    .index("by_feedbackAt", ["feedbackAt"]),
  demoStats: defineTable({
    key: v.literal("current"),
    enabled: v.boolean(),
    takeoverId: v.id("takeovers"),
    values: demoValues,
    presentation: v.optional(demoPresentation),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  ...rewardTables,
  takeoverAudit: defineTable({
    takeoverNumber: v.number(),
    publicTakeoverId: v.string(),
    takeoverId: v.id("takeovers"),
    activatedAt: v.number(),
    amountCents: v.number(),
    currency: v.string(),
    contentHash: v.string(),
    previousAuditHash: v.string(),
    auditHash: v.string(),
  }).index("by_number", ["takeoverNumber"]),

  visitorPingReports: defineTable({
    key: v.literal("current"),
    attempt: v.number(),
    nextAt: v.number(),
    failures: v.number(),
    lastError: v.optional(v.string()),
    snapshot: v.optional(visitorPingSnapshot),
  }).index("by_key", ["key"]),
  whispers: defineTable({ takeoverId: v.id("takeovers"), text: v.string(), hidden: v.boolean(), createdAt: v.number() }).index("by_owner_visible", ["takeoverId", "hidden"]).index("by_created", ["createdAt"]),
  amaQuestions: defineTable({ takeoverId:v.id("takeovers"), question:v.string(), answer:v.optional(v.string()), state:v.union(v.literal("pending"),v.literal("answered"),v.literal("dismissed")), createdAt:v.number() }).index("by_owner_state",["takeoverId","state","createdAt"]),
  wallVotes: defineTable({takeoverId:v.id("takeovers"),voterHash:v.string(),choice:v.union(v.literal("keep"),v.literal("yeet"))}).index("by_owner_voter",["takeoverId","voterHash"]),
  wallVoteTotals: defineTable({takeoverId:v.id("takeovers"),shard:v.number(),keep:v.number(),yeet:v.number()}).index("by_owner_shard",["takeoverId","shard"]),
  takeovers: defineTable({
    amaEnabled: v.optional(v.boolean()),
    amaBatchSince: v.optional(v.number()),
    originalContent: v.optional(editableContent),
    contentRevision: v.optional(v.number()),
    websiteUrl: v.string(),
    domain: v.string(),
    description: v.string(),
  morseMessage: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    contentType: v.optional(v.union(v.literal("link"), v.literal("personal"))),
    linkType: v.optional(v.string()),
    displayName: v.optional(v.string()),
    takeoverNumber: v.optional(v.number()),
    publicTakeoverId: v.optional(v.string()),
    shareVisitors: v.optional(v.number()),
    shareTakeovers: v.optional(v.number()),
    seoApproved: v.optional(v.boolean()),
    seoRevision: v.optional(v.number()),
    seoSummary: v.optional(v.string()),
    seoReviewedAt: v.optional(v.number()),
    previousAuditHash: v.optional(v.string()),
    auditHash: v.optional(v.string()),
    outboundLinkEnabled: v.optional(v.boolean()),
    kind,
    status,
    sourceTakeoverId: v.optional(v.id("takeovers")),
    endReason: v.optional(
      v.union(
        v.literal("purchase"),
        v.literal("moderation"),
        v.literal("admin"),
      ),
    ),
    blocked: v.boolean(),
    createdAt: v.number(),
    activatedAt: v.optional(v.number()),
    replacedAt: v.optional(v.number()),
    activationSequence: v.optional(v.number()),
    impressions: v.number(),
    uniqueVisitors: v.number(),
    clicks: v.number(),
  })
    .index("by_takeoverNumber", ["takeoverNumber"])
    .index("by_publicId", ["publicTakeoverId"])
    .index("by_seo_sequence", ["seoApproved", "activationSequence"])
    .index("by_status", ["status"])
    .index("by_activationSequence", ["activationSequence"])
    .index("by_activatedAt", ["activatedAt"])
    .index("by_logoStorageId", ["logoStorageId"])
    .index("by_originalLogoStorageId", ["originalContent.logoStorageId"]),
  hallEntries: defineTable({
    takeoverId: v.id("takeovers"), eligible: v.boolean(), completed: v.boolean(),
    reignMs: v.number(), referrals: v.number(), clicks: v.number(),
  }).index("by_takeover", ["takeoverId"])
    .index("by_reign", ["eligible", "completed", "reignMs"])
    .index("by_referrals", ["eligible", "referrals"])
    .index("by_clicks", ["eligible", "clicks"]),
  gazetteIssues: defineTable({
    date: v.string(), headline: v.string(), body: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    sources: v.array(v.id("takeovers")), revision: v.number(), createdAt: v.number(),
  }).index("by_date", ["date"]).index("by_status_date", ["status", "date"]),
  growthSettings: defineTable({
    crumblingEnabled: v.optional(v.boolean()),
    gazetteEnabled: v.optional(v.boolean()),
    gazetteAuto: v.optional(v.boolean()),
    communityEvent: v.optional(v.object({ enabled: v.boolean(), title: v.string(), description: v.string(), start: v.number(), end: v.number() })),
    hallEnabled: v.optional(v.boolean()),
    hallReady: v.optional(v.boolean()),
    hallCursor: v.optional(v.union(v.string(), v.null())),
    checkoutPaused: v.optional(v.boolean()),
    key: v.literal("current"),
    historyEnabled: v.boolean(),
  }).index("by_key", ["key"]),
  referralVisits: defineTable({
    takeoverId: v.id("takeovers"),
    visitorHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_source_visitor", ["takeoverId", "visitorHash"])
    .index("by_created", ["createdAt"]),
  purchases: defineTable({
    freeEntryReference: v.optional(v.string()),
    freeEntryReceivedAt: v.optional(v.number()),
    basePriceCents: v.optional(v.number()),
    sessionCreatedAt: v.optional(v.number()),
    stripeStatus: v.optional(
      v.union(
        v.literal("paid"),
        v.literal("processing"),
        v.literal("expired"),
        v.literal("unpaid"),
      ),
    ),
    stripeCheckedAt: v.optional(v.number()),
    confirmationCheckedAt: v.optional(v.number()),
    resumeSeed: v.optional(v.string()),
    resumeHash: v.optional(v.string()),
    referralSource: v.optional(v.id("takeovers")),
    buyerEmailKey: v.optional(v.string()),
    receiptEmailKey: v.optional(v.string()),
    funnelCheckoutTracked: v.optional(v.boolean()),
    weeklyDigestEnabled: v.optional(v.boolean()),
    takeoverId: v.id("takeovers"),
    buyerEmail: v.string(),
    legalVersion: v.optional(v.string()),
    paymentIssue: v.optional(v.string()),
    receiptEmail: v.optional(v.string()),
    requestKey: v.string(),
    fingerprint: v.string(),
    tokenHash: v.string(),
    tokenExpiresAt: v.number(),
    sessionId: v.optional(v.string()),
    paymentIntentId: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    checkoutExpiresAt: v.number(),
    expiredConfirmed: v.optional(v.boolean()),
    cleanupAt: v.optional(v.number()),
    issuedByAdmin: v.optional(v.string()),
    issuedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    amountCents: v.optional(v.number()),
    taxCents: v.optional(v.number()),
    presentmentAmount: v.optional(v.number()),
    presentmentCurrency: v.optional(v.string()),
    currency: v.optional(v.string()),
    environment: v.union(v.literal("test"), v.literal("production")),
    createdAt: v.number(),
    contactDeleteAt: v.number(),
  })
    .index("by_buyerEmailKey", ["buyerEmailKey"])
    .index("by_receiptEmailKey", ["receiptEmailKey"])
    .index("by_takeoverId", ["takeoverId"])
    .index("by_requestKey", ["requestKey"])
    .index("by_tokenHash", ["tokenHash"])
    .index("by_resumeHash", ["resumeHash"])
    .index("by_sessionId", ["sessionId"])
    .index("by_paymentIntentId", ["paymentIntentId"])
    .index("by_contactDeleteAt", ["contactDeleteAt"])
    .index("by_cleanupAt", ["cleanupAt"]),
  paymentEvents: defineTable({
    eventId: v.string(),
    purchaseId: v.id("purchases"),
    createdAt: v.number(),
  }).index("by_eventId", ["eventId"]),
  siteStats: defineTable({
    key: v.literal("wall"),
    currentTakeoverId: v.id("takeovers"),
    currentActivationSequence: v.number(),
    auditMigrationCursor: v.optional(v.number()),
    auditMigrationNumber: v.optional(v.number()),
    auditMigrationHash: v.optional(v.string()),
    auditHash: v.optional(v.string()),
    totalVisitors: v.number(),
    totalTakeovers: v.number(),
    numberingOffset: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  dailyStats: defineTable({
    funnelStartedAt: v.optional(v.number()),
    funnelVisits: v.optional(v.number()),
    checkoutStarts: v.optional(v.number()),
    paidActivations: v.optional(v.number()),
    date: v.string(),
    visitors: v.number(),
    impressions: v.number(),
    clicks: v.number(),
    takeovers: v.number(),
    revenueCents: v.optional(v.number()),
  }).index("by_date", ["date"]),
  siteVisitors: defineTable({
    visitorHash: v.string(),
    firstSeenAt: v.number(),
  }).index("by_visitorHash", ["visitorHash"]),
  dailyVisitors: defineTable({
    date: v.string(),
    visitorHash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_date_visitorHash", ["date", "visitorHash"])
    .index("by_expiresAt", ["expiresAt"]),
  takeoverVisitors: defineTable({
    takeoverId: v.id("takeovers"),
    visitorHash: v.string(),
    firstSeenAt: v.number(),
  })
    .index("by_takeoverId_visitorHash", ["takeoverId", "visitorHash"])
    .index("by_takeover_firstSeen", ["takeoverId", "firstSeenAt"]),
  takeoverRegions: defineTable({
    takeoverId: v.id("takeovers"),
    regionCode: v.string(),
    impressions: v.number(),
    uniqueVisitors: v.number(),
  }).index("by_takeoverId_regionCode", ["takeoverId", "regionCode"]),
  receipts: defineTable({ key: v.string(), expiresAt: v.number() })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),
  limits: defineTable({
    key: v.string(),
    count: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),
  uploads: defineTable({
    key: v.string(),
    ownerHash: v.string(),
    storageId: v.optional(v.id("_storage")),
    claimed: v.boolean(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),
  jobs: defineTable({
    sender: v.optional(emailSenderFields),
    recoveryToReceipt: v.optional(v.boolean()),
    finalReport: v.optional(finalReportSnapshot),
    adminRecipient: v.optional(v.string()),
    adminNotice: v.optional(
      v.object({ subject: v.string(), body: v.string() }),
    ),
    digest: v.optional(digestSnapshot),
    key: v.string(),
    kind: jobKind,
    takeoverId: v.id("takeovers"),
    deliveryId: v.string(),
    visitorHash: v.optional(v.string()),
    pageId: v.optional(v.string()),
    region: v.optional(v.string()),
    timestamp: v.number(),
    state: v.union(
      v.literal("pending"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    nextAt: v.number(),
    lastError: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_state_nextAt", ["state", "nextAt"])
    .index("by_takeover_timestamp", ["takeoverId", "timestamp"]),
  moderation: defineTable({
    removedId: v.id("takeovers"),
    restoredId: v.id("takeovers"),
    sourceId: v.id("takeovers"),
    reason: v.string(),
    operatorReference: v.string(),
    timestamp: v.number(),
  }).index("by_operatorReference", ["operatorReference"]),
});
