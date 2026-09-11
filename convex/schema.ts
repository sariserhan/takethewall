import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export const kind = v.union(
  v.literal("paid"),
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
  v.literal("replacement_email"),
  v.literal("checkout_completed"),
  v.literal("takeover_activated"),
  v.literal("wall_impression"),
  v.literal("wall_owner_link_click"),
  v.literal("take_wall_clicked"),
  v.literal("checkout_started"),
);
export default defineSchema({
  takeovers: defineTable({
    websiteUrl: v.string(),
    domain: v.string(),
    description: v.string(),
    logoStorageId: v.id("_storage"),
    kind,
    status,
    sourceTakeoverId: v.optional(v.id("takeovers")),
    endReason: v.optional(
      v.union(v.literal("purchase"), v.literal("moderation")),
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
    .index("by_status", ["status"])
    .index("by_activationSequence", ["activationSequence"])
    .index("by_logoStorageId", ["logoStorageId"]),
  purchases: defineTable({
    takeoverId: v.id("takeovers"),
    buyerEmail: v.string(),
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
    paidAt: v.optional(v.number()),
    amountCents: v.optional(v.number()),
    currency: v.optional(v.string()),
    environment: v.union(v.literal("test"), v.literal("production")),
    createdAt: v.number(),
    contactDeleteAt: v.number(),
  })
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
    totalVisitors: v.number(),
    totalTakeovers: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  dailyStats: defineTable({
    date: v.string(),
    visitors: v.number(),
    impressions: v.number(),
    clicks: v.number(),
    takeovers: v.number(),
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
