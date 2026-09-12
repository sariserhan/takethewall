import { v } from "convex/values";
export const demoValues = v.object({
  visitorsToday: v.number(),
  totalVisitors: v.number(),
  impressions: v.number(),
  uniqueVisitors: v.number(),
  clicks: v.number(),
});
export const demoPresentation = v.object({
  displayName: v.string(),
  description: v.string(),
  websiteUrl: v.string(),
  ownerSince: v.number(),
  previousOwnerName: v.string(),
  takeoverCount: v.number(),
});
