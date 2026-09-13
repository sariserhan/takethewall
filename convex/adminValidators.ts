import { v } from "convex/values";
import schema from "./schema";
export const milestoneResult = v.object({
  ...schema.tables.milestoneRewards.validator.fields,
  _id: v.id("milestoneRewards"),
  _creationTime: v.number(),
});
export const ticketResult = v.object({
  ...schema.tables.supportTickets.validator.fields,
  _id: v.id("supportTickets"),
  _creationTime: v.number(),
});
export const auditResult = v.object({
  ...schema.tables.adminAudit.validator.fields,
  _id: v.id("adminAudit"),
  _creationTime: v.number(),
});
export const takeoverResult = v.object({
  ...schema.tables.takeovers.validator.fields,
  _id: v.id("takeovers"),
  _creationTime: v.number(),
  auditSequenceNumber: v.optional(v.number()),
  logoUrl: v.union(v.string(), v.null()),
  paymentStatus: v.string(),
  placementType: v.string(),
  checkoutSessionId: v.union(v.string(), v.null()),
  paymentEnvironment: v.union(
    v.literal("production"),
    v.literal("test"),
    v.null(),
  ),
  stripeCheckedAt: v.union(v.number(), v.null()),
  amountCents: v.union(v.number(), v.null()),
  taxCents: v.union(v.number(), v.null()),
  presentmentAmount: v.union(v.number(), v.null()),
  presentmentCurrency: v.union(v.string(), v.null()),
  paymentIssue: v.union(v.string(), v.null()),
  paymentReference: v.union(v.string(), v.null()),
});
export const claimRow = v.object({
  rewardKind: v.optional(v.string()),
  _id: v.id("rewardClaims"),
  _creationTime: v.number(),
  takeoverNumber: v.number(),
  displayName: v.optional(v.string()),
  status: v.string(),
  deadlineAt: v.number(),
  rewardUsd: v.optional(v.number()),
  milestone: v.optional(v.number()),
  unread: v.boolean(),
  lastMessage: v.string(),
  updatedAt: v.number(),
});
export const adminPage = v.object({
  rows: v.array(
    v.union(
      takeoverResult,
      milestoneResult,
      claimRow,
      ticketResult,
      auditResult,
    ),
  ),
  next: v.union(v.string(), v.null()),
});

const claimFields = schema.tables.rewardClaims.validator.fields;
export const claimDetails = v.object({
  claim: v.object({
    id: v.id("rewardClaims"),
    status: claimFields.status,
    takeoverNumber: v.number(),
    email: v.string(),
    legalName: claimFields.legalName,
    country: claimFields.country,
    region: claimFields.region,
    dob: claimFields.dob,
    declaration: claimFields.declaration,
    deadlineAt: v.number(),
    requiredInformation: claimFields.requiredInformation,
    privateReason: claimFields.privateReason,
    rulesAcceptedAt: claimFields.rulesAcceptedAt,
  }),
  reward: v.union(milestoneResult, v.null()),
  messages: v.array(
    v.object({
      ...schema.tables.rewardMessages.validator.fields,
      _id: v.id("rewardMessages"),
      _creationTime: v.number(),
    }),
  ),
  history: v.array(auditResult),
  documents: v.array(
    v.object({
      id: v.id("claimDocuments"),
      request: v.string(),
      uploaded: v.boolean(),
      deletedAt: v.optional(v.number()),
    }),
  ),
});
export const ticketDetails = v.object({
  ticket: v.union(ticketResult, v.null()),
  messages: v.array(
    v.object({
      ...schema.tables.supportMessages.validator.fields,
      _id: v.id("supportMessages"),
      _creationTime: v.number(),
    }),
  ),
});
