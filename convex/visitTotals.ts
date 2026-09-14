import type { QueryCtx } from "./_generated/server";
// Legacy deployments already retain daily view totals. Read them only until
// the next analytics flush initializes the persistent lifetime counter.
export async function historicalViews(ctx: QueryCtx) {
  const days = await ctx.db.query("dailyStats").withIndex("by_date").take(10000);
  if (days.length === 10000) throw Error("Lifetime view history requires a paginated backfill");
  return days.reduce((sum, day) => sum + day.impressions, 0);
}
