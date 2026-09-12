import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, settings } from "./rewardModel";
export const overview = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [site, report, mailFailures, jobs, payment, config] =
      await Promise.all([
        ctx.db
          .query("siteStats")
          .withIndex("by_key", (q) => q.eq("key", "wall"))
          .unique(),
        ctx.db
          .query("visitorPingReports")
          .withIndex("by_key", (q) => q.eq("key", "current"))
          .unique(),
        ctx.db
          .query("transactionalMail")
          .withIndex("by_state_next", (q) => q.eq("state", "failed"))
          .take(100),
        ctx.db
          .query("jobs")
          .withIndex("by_state_nextAt", (q) => q.eq("state", "failed"))
          .take(100),
        ctx.db.query("paymentEvents").order("desc").first(),
        settings(ctx),
      ]);
    const missing = (names: string[]) =>
      names.filter((n) => !process.env[n]?.trim());
    return JSON.stringify({
      wallInitialized: !!site,
      lastPaymentAt: payment?.createdAt ?? null,
      emailMissing: missing(["RESEND_API_KEY", "RESEND_FROM"]),
      failedMail: mailFailures.length,
      failedJobs: jobs.length,
      countsCappedAt: 100,
      analyticsMissing: missing([
        "VISITORPING_API_KEY",
        "VISITORPING_SITE_ID",
        "VISITORPING_SITE_KEY",
      ]),
      metricsEnabled: process.env.PUBLIC_METRICS_ENABLED === "true",
      environment: process.env.WALL_ENVIRONMENT ?? "unset",
      analyticsError: !!report?.lastError,
      analyticsLastSuccessAt: report?.snapshot?.fetchedAt ?? null,
      rewardsEnabled: config.rewardsEnabled,
      payoutsEnabled: config.payoutsEnabled,
      promotionEnabled: config.promotionEnabled,
      claimSecretConfigured: !!process.env.CLAIM_TOKEN_SECRET,
      rulesVersion: config.rulesVersion,
    });
  },
});
