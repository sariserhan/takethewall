import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import saved from "../lib/radar-city-snapshot.json";
export const cityDelta = v.object({ city: v.string(), country: v.string(), views: v.number() });
export type CityDelta = { city: string; country: string; views: number };
export const radarCityReport = v.object({ date: v.string(), views: v.number(), uniqueVisitors: v.number(), historicalThrough: v.union(v.string(), v.null()), cities: v.array(v.object({ city: v.string(), country: v.string(), label: v.string(), views: v.number() })) });
export function cityName(city: string) { return city.trim().replace(/^ft\.?\s+/i, "Fort "); }
export function addCityDelta(rows: CityDelta[], city: string, country: string, views: number) {
  city = cityName(city);
  const row = rows.find(r => r.city.toLowerCase() === city.toLowerCase() && r.country === country);
  if (row) row.views += views;
  else rows.push({ city, country, views });
}
export function afterCitySnapshot(occurredAt: number) {
  return new Date(occurredAt).toISOString().slice(0, 10) !== saved.date || occurredAt > Date.parse(saved.to);
}
export async function applyCityDelta(ctx: MutationCtx, date: string, delta: CityDelta) {
  if (!delta.views) return;
  const city = cityName(delta.city), key = `${delta.country}:${city.toLowerCase()}`;
  const row = await ctx.db.query("dailyCityViews").withIndex("by_date_key", q => q.eq("date", date).eq("key", key)).unique();
  if (row) await ctx.db.patch(row._id, { views: row.views + delta.views });
  else await ctx.db.insert("dailyCityViews", { date, key, city, country: delta.country, views: delta.views });
}
export async function readRadarCities(ctx: QueryCtx, date: string, views: number, uniqueVisitors: number) {
  const current = await ctx.db.query("dailyCityViews").withIndex("by_date_key", q => q.eq("date", date)).take(500);
  const live = current.filter(r => r.views > 0);
  const recorded = live.reduce((sum, r) => sum + r.views, 0);
  // A snapshot is evidence for historical totals, never extra visits.
  const useSaved = date === saved.date && saved.views + recorded <= views;
  const groups: CityDelta[] = [];
  if (useSaved) for (const row of saved.cities) addCityDelta(groups, row.city, row.country, row.views);
  if (recorded <= views) for (const row of live) addCityDelta(groups, row.city, row.country, row.views);
  const missing = views - groups.reduce((sum, r) => sum + r.views, 0);
  if (missing > 0) addCityDelta(groups, "", "ZZ", missing);
  return {
    date, views, uniqueVisitors, historicalThrough: useSaved ? saved.to : null,
    cities: groups.filter(r => r.views > 0).sort((a, b) => b.views - a.views || a.city.localeCompare(b.city)).map(row => ({ ...row, label: row.city ? `${row.city}, ${row.country}` : row.country !== "ZZ" ? `City not recorded, ${row.country}` : "Location not recorded" })),
  };
}
