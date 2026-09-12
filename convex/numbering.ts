import { internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { audit, settings } from "./rewardModel";

export async function numberingOffset(ctx: QueryCtx) {
  const site = await ctx.db
    .query("siteStats")
    .withIndex("by_key", (q) => q.eq("key", "wall"))
    .unique();
  return site?.numberingOffset ?? 0;
}

// One-time launch configuration. Audit sequence numbers and hashes stay immutable.
export const initialize = internalMutation({
  args: { expectedRecordedCount: v.number() },
  returns: v.object({ offset: v.number(), currentNumber: v.number() }),
  handler: async (ctx, args) => {
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    if (!site) throw new Error("Initialize the wall first.");
    if (site.numberingOffset === 15)
      return { offset: 15, currentNumber: site.totalTakeovers + 15 };
    if (site.numberingOffset !== undefined)
      throw new Error("The numbering offset is already locked.");
    if (
      site.totalTakeovers !== args.expectedRecordedCount ||
      site.totalTakeovers > 1
    )
      throw new Error(
        "The wall has changed. Review the count before setting the launch offset.",
      );
    if (site.auditMigrationCursor !== undefined)
      throw new Error("Finish the audit migration first.");
    const reward = await ctx.db
      .query("milestoneRewards")
      .withIndex("by_number")
      .first();
    const config = await settings(ctx);
    if (
      reward ||
      config.milestones.some(
        (m) => m.takeoverNumber <= site.totalTakeovers + 15,
      )
    )
      throw new Error(
        "The offset cannot cross a milestone or change existing reward obligations.",
      );
    await ctx.db.patch(site._id, { numberingOffset: 15 });
    await audit(
      ctx,
      "operator",
      "NUMBERING_OFFSET_INITIALIZED",
      site._id,
      {
        offset: 15,
        recordedCount: site.totalTakeovers,
        publicNumber: site.totalTakeovers + 15,
      },
      "Public numbering starts with an offset of 15. No takeover or payment records were added.",
    );
    return { offset: 15, currentNumber: site.totalTakeovers + 15 };
  },
});
