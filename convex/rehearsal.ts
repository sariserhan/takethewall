import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { DEFAULT_RULES } from "../lib/reward-rules";
import { canonical } from "../lib/audit";
import { audit } from "./rewardModel";

// Explicitly restricted to this project's personal development deployment.
export const prepare = internalMutation({
  args: {},
  returns: v.object({ ready: v.boolean(), milestones: v.array(v.number()) }),
  handler: async (ctx) => {
    if (
      process.env.CONVEX_CLOUD_URL !==
        "https://aromatic-falcon-454.convex.cloud" ||
      (process.env.WALL_ENVIRONMENT ?? "test") !== "test"
    )
      throw new Error(
        "Prize rehearsal is only available on aromatic-falcon-454 in test mode.",
      );
    const existing = await ctx.db
      .query("rewardSettings")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    const version = "development-rehearsal-v1";
    if (existing?.value.rulesVersion === version)
      return { ready: true, milestones: [1, 2, 3] };
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    const reached = await ctx.db
      .query("milestoneRewards")
      .withIndex("by_number")
      .first();
    if ((site?.totalTakeovers ?? 0) > 0 || reached || existing)
      throw new Error(
        "Development already has reward settings or takeover history. Use a fresh rehearsal deployment instead of overwriting it.",
      );
    const milestones = [1, 2, 3].map((takeoverNumber) => ({
      takeoverNumber,
      rewardUsd: takeoverNumber,
    }));
    await ctx.db.insert("rewardSettings", {
      key: "current",
      value: {
        milestones,
        initialDays: 1,
        additionalDays: 1,
        rulesVersion: version,
        rulesJson: canonical({
          ...DEFAULT_RULES,
          version,
          milestones,
          initialClaimDays: 1,
          additionalInformationDays: 1,
          purchase:
            "DEVELOPMENT REHEARSAL ONLY. No real purchase or prize is promised.",
          ordering:
            "Paid test activations and counted admin issuances share sequential numbers. Uncounted admin placements are excluded.",
          claims:
            "Test initial and additional-information deadlines are one day each.",
          payout:
            "Simulation only. Use TEST-NO-MONEY references. No bank transfer is performed.",
        }),
        rewardsEnabled: true,
        payoutsEnabled: true,
        promotionEnabled: true,
      },
    });
    await audit(ctx, "development-tooling", "REHEARSAL_PREPARED", "settings", {
      milestones: [1, 2, 3],
      noMoney: true,
    });
    return { ready: true, milestones: [1, 2, 3] };
  },
});
