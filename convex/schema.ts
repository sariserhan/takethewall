import { demoValues, demoPresentation } from "./demoValues";
import { rewardTables, emailSenderFields } from "./rewardSchema";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
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
  v.literal("owner_access_email"),
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
export const digestSnapshot = v.object({displayName:v.string(),number:v.union(v.number(),v.null()),impressions:v.number(),uniqueVisitors:v.number(),clicks:v.number(),activatedAt:v.number(),snapshotAt:v.number()});
export const editableContent = v.object({contentType:v.string(),linkType:v.string(),websiteUrl:v.string(),domain:v.string(),displayName:v.string(),description:v.string(),logoStorageId:v.optional(v.id("_storage"))});
export const finalReportSnapshot = v.object({...digestSnapshot.fields,replacedAt:v.number(),endReason:v.string()});
export default defineSchema({
  milestoneSubscribers:defineTable({email:v.string(),emailHash:v.string(),seed:v.string(),confirmHash:v.string(),unsubscribeHash:v.string(),active:v.boolean(),generation:v.number(),expiresAt:v.number(),lastNotified:v.number(),createdAt:v.number()}).index("by_email",["emailHash"]).index("by_confirm",["confirmHash"]).index("by_unsubscribe",["unsubscribeHash"]).index("by_active_milestone",["active","lastNotified"]).index("by_active_expiry",["active","expiresAt"]),
  notificationSettings: defineTable({key:v.literal("current"),enabled:v.boolean(),recipient:v.string(),revision:v.number()}).index("by_key",["key"]),
  ownerAccess: defineTable({takeoverId:v.id("takeovers"),seed:v.string(),tokenHash:v.string(),unsubscribeHash:v.string(),weeklyDigestEnabled:v.boolean(),createdAt:v.number()}).index("by_takeover",["takeoverId"]).index("by_token",["tokenHash"]).index("by_unsubscribe",["unsubscribeHash"]),
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
  takeovers: defineTable({
    originalContent: v.optional(editableContent),
    contentRevision: v.optional(v.number()),
    websiteUrl: v.string(),
    domain: v.string(),
    description: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    contentType: v.optional(v.union(v.literal("link"), v.literal("personal"))),
    linkType: v.optional(v.string()),
    displayName: v.optional(v.string()),
    takeoverNumber: v.optional(v.number()),
    publicTakeoverId: v.optional(v.string()),
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
    .index("by_status", ["status"])
    .index("by_activationSequence", ["activationSequence"])
    .index("by_logoStorageId", ["logoStorageId"])
    .index("by_originalLogoStorageId", ["originalContent.logoStorageId"]),
  purchases: defineTable({
    buyerEmailKey:v.optional(v.string()),
    receiptEmailKey:v.optional(v.string()),
    funnelCheckoutTracked:v.optional(v.boolean()),
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
    funnelStartedAt:v.optional(v.number()),
    funnelVisits:v.optional(v.number()),
    checkoutStarts:v.optional(v.number()),
    paidActivations:v.optional(v.number()),
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
  }).index("by_takeoverId_visitorHash", ["takeoverId", "visitorHash"]),
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
    sender:v.optional(emailSenderFields),
    recoveryToReceipt:v.optional(v.boolean()),
    finalReport:v.optional(finalReportSnapshot),
    adminRecipient:v.optional(v.string()),
    adminNotice: v.optional(v.object({subject:v.string(),body:v.string()})),
    digest:v.optional(digestSnapshot),
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
    .index("by_state_nextAt", ["state", "nextAt"]),
  moderation: defineTable({
    removedId: v.id("takeovers"),
    restoredId: v.id("takeovers"),
    sourceId: v.id("takeovers"),
    reason: v.string(),
    operatorReference: v.string(),
    timestamp: v.number(),
  }).index("by_operatorReference", ["operatorReference"]),
});
