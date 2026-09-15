import { v } from "convex/values";
export const visitorPingAlert = v.object({
  event: v.union(v.literal("visitor.arrival"), v.literal("visitor.hot_lead")),
  data: v.object({
    siteName: v.string(),
    siteDomain: v.string(),
    location: v.object({
      city: v.string(),
      region: v.string(),
      country: v.string(),
    }),
    source: v.string(),
    entryPage: v.string(),
    sessionId: v.optional(v.string()),
    visitorId: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    referralPublicId: v.optional(v.string()),
    deviceType: v.string(),
    isHotLead: v.boolean(),
    companyName: v.string(),
  }),
});
