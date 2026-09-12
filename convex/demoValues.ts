import { v } from "convex/values";
export const demoValues = v.object({
  visitorsToday: v.number(),
  totalVisitors: v.number(),
  impressions: v.number(),
  uniqueVisitors: v.number(),
  clicks: v.number(),
});
