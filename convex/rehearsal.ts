import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { DEFAULT_RULES } from "../lib/reward-rules";
import { MILESTONES } from "../lib/config";
import { canonical, sha } from "../lib/audit";
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

// Leave historical test rewards and their immutable rules intact; only future
// activations switch back to the standard tiers and dual reward rules.
export const finish = internalMutation({
  args: {},
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx) => {
    if (
      process.env.CONVEX_CLOUD_URL !==
        "https://aromatic-falcon-454.convex.cloud" ||
      process.env.WALL_ENVIRONMENT !== "test"
    )
      throw new Error(
        "Only the personal test deployment can finish rehearsal.",
      );
    const row = await ctx.db
      .query("rewardSettings")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    if (row?.value.rulesVersion !== "development-rehearsal-v1")
      return { changed: false };
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    if ((site?.totalTakeovers ?? 0) + (site?.numberingOffset ?? 0) >= 100)
      throw new Error(
        "Standard milestones have already been reached; review settings manually.",
      );
    const version = "development-standard-dual-v1";
    const rulesJson = canonical({ ...DEFAULT_RULES, version });
    const existing = await ctx.db
      .query("rewardRules")
      .withIndex("by_version", (q) => q.eq("version", version))
      .unique();
    if (existing && existing.json !== rulesJson)
      throw new Error("Rules version already exists with different content.");
    if (!existing)
      await ctx.db.insert("rewardRules", {
        version,
        json: rulesJson,
        hash: sha(rulesJson),
        createdAt: Date.now(),
      });
    await ctx.db.patch(row._id, {
      value: {
        ...row.value,
        milestones: MILESTONES,
        dualRewardsEnabled: true,
        initialDays: 7,
        additionalDays: 7,
        rulesVersion: version,
        rulesJson,
      },
    });
    await audit(ctx, "development-tooling", "REHEARSAL_FINISHED", "settings", {
      rulesVersion: version,
      historicalClaimsPreserved: true,
    });
    return { changed: true };
  },
});
