import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { daily } from "./model";
import { requireAdmin } from "./rewardModel";
export async function incrementFunnel(
  ctx: MutationCtx,
  stage: "funnelVisits" | "checkoutStarts" | "paidActivations",
) {
  if (
    process.env.WALL_ENVIRONMENT !== "production" ||
    process.env.PUBLIC_METRICS_ENABLED !== "true"
  )
    return;
  const d = await daily(ctx);
  await ctx.db.patch(d._id, {
    [stage]: (d[stage] ?? 0) + 1,
    funnelStartedAt: d.funnelStartedAt ?? Date.now(),
  });
}
export const report = query({
  args: { from: v.string(), to: v.string() },
  returns: v.object({
    visits: v.number(),
    checkoutStarts: v.number(),
    paidActivations: v.number(),
    startedAt: v.union(v.number(), v.null()),
    daysTracked: v.number(),
  }),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const from = Date.parse(a.from + "T00:00:00Z"),
      to = Date.parse(a.to + "T00:00:00Z");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(a.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(a.to) ||
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      to < from ||
      to - from > 31 * 86400_000
    )
      throw new Error("Choose a range of up to 31 days.");
    const rows = await ctx.db
      .query("dailyStats")
      .withIndex("by_date", (q) => q.gte("date", a.from).lte("date", a.to))
      .take(32);
    const tracked = rows.filter((r) => r.funnelStartedAt !== undefined);
    return {
      visits: tracked.reduce((n, r) => n + (r.funnelVisits ?? 0), 0),
      checkoutStarts: tracked.reduce((n, r) => n + (r.checkoutStarts ?? 0), 0),
      paidActivations: tracked.reduce(
        (n, r) => n + (r.paidActivations ?? 0),
        0,
      ),
      startedAt: tracked.length
        ? Math.min(...tracked.map((r) => r.funnelStartedAt!))
        : null,
      daysTracked: tracked.length,
    };
  },
});
