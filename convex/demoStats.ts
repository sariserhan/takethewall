import { query, mutation } from "./_generated/server";
import { demoCountError } from "../lib/demo-validation";
import { v, ConvexError } from "convex/values";
import { validateWallContent, plainText } from "../lib/content";
import { demoValues, demoPresentation } from "./demoValues";
import { audit, requireAdmin } from "./rewardModel";
export const read = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      enabled: v.boolean(),
      values: demoValues,
      presentation: v.optional(demoPresentation),
      activeForCurrentOwner: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query("demoStats")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    if (!row) return null;
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    return {
      enabled: row.enabled,
      values: row.values,
      ...(row.presentation ? { presentation: row.presentation } : {}),
      activeForCurrentOwner:
        row.enabled && row.takeoverId === site?.currentTakeoverId,
    };
  },
});
export const save = mutation({
  args: {
    enabled: v.boolean(),
    values: demoValues,
    presentation: v.optional(demoPresentation),
    reason: v.string(),
    expectedCurrentId: v.id("takeovers"),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    if (!a.reason.trim() || a.reason.length > 1000)
      throw new ConvexError("Enter a reason (up to 1,000 characters).");
    const countError = demoCountError(a.values);
    if (countError) throw new ConvexError(countError);
    let presentation = a.presentation;
    if (presentation) {
      if (
        !Number.isSafeInteger(presentation.takeoverCount) ||
        presentation.takeoverCount < 0 ||
        presentation.takeoverCount > 1_000_000_000
      )
        throw new ConvexError(
          "Demo takeover count must be a whole number from 0 to 1 billion.",
        );
      if (
        !Number.isSafeInteger(presentation.ownerSince) ||
        presentation.ownerSince < 0 ||
        presentation.ownerSince > Date.now()
      )
        throw new ConvexError(
          "Demo start time must be a valid past UTC timestamp.",
        );
      const content = validateWallContent({
        contentType: presentation.websiteUrl ? "link" : "personal",
        websiteUrl: presentation.websiteUrl,
        displayName: presentation.displayName,
        description: presentation.description,
      });
      presentation = {
        ...presentation,
        displayName: content.displayName,
        description: content.description,
        websiteUrl: content.websiteUrl,
        previousOwnerName: presentation.previousOwnerName.trim()
          ? plainText(presentation.previousOwnerName, 60)
          : "",
      };
    }
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    if (!site || site.currentTakeoverId !== a.expectedCurrentId)
      throw new ConvexError(
        "The wall changed. Reload and review the current owner.",
      );
    const row = await ctx.db
      .query("demoStats")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    const next = {
      enabled: a.enabled,
      values: a.values,
      presentation,
      takeoverId: site.currentTakeoverId,
      updatedAt: Date.now(),
    };
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("demoStats", { key: "current", ...next });
    await audit(ctx, actor, "DEMO_STATS_UPDATED", site.currentTakeoverId, {
      reason: a.reason.trim(),
      before: row
        ? {
            enabled: row.enabled,
            values: row.values,
            ...(row.presentation ? { presentation: row.presentation } : {}),
            takeoverId: row.takeoverId,
          }
        : null,
      after: next,
    });
    return null;
  },
});
