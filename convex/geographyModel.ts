import { v } from "convex/values";
export const websiteGeography = v.object({
  from: v.string(),
  to: v.string(),
  fetchedAt: v.number(),
  historyDays: v.number(),
  uniqueVisitors: v.number(),
  countries: v.array(
    v.object({ countryCode: v.string(), visitors: v.number() }),
  ),
  truncated: v.boolean(),
});
