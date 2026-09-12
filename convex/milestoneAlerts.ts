import { emailAllowed } from "./emailPolicy";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { validateEmail } from "../lib/validation";
import { sha } from "../lib/audit";
import { alertConfirmation, alertUnsubscribe } from "../lib/alert-secrets";
import { limit, getSite } from "./model";
import { mail, settings } from "./rewardModel";
export const subscribe = internalMutation({
  args: {
    email: v.string(),
    ipHash: v.string(),
    consent: v.boolean(),
    honeypot: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    if (a.honeypot) return null;
    if (!a.consent) throw new Error("Confirm that you want milestone emails.");
    await limit(ctx, "alerts-ip:" + a.ipHash, 5, 3600_000);
    await limit(ctx, "alerts-global", 100, 3600_000);
    const email = validateEmail(a.email),
      emailHash = sha(email.toLowerCase());
    await limit(ctx, "alerts-email:" + emailHash, 3, 3600_000);
    await requestSubscription(ctx, email);
    return null;
  },
});
export const manage = internalMutation({
  args: {
    token: v.string(),
    action: v.union(v.literal("confirm"), v.literal("unsubscribe")),
  },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    if (!/^[a-f0-9]{64}$/.test(a.token)) return false;
    const row =
      a.action === "confirm"
        ? await ctx.db
            .query("milestoneSubscribers")
            .withIndex("by_confirm", (q) => q.eq("confirmHash", sha(a.token)))
            .unique()
        : await ctx.db
            .query("milestoneSubscribers")
            .withIndex("by_unsubscribe", (q) =>
              q.eq("unsubscribeHash", sha(a.token)),
            )
            .unique();
    if (!row) return false;
    if (a.action === "confirm") {
      if (
        row.expiresAt < Date.now() ||
        !row.email ||
        !(await emailAllowed(ctx, row.email, "milestone_confirm"))
      )
        return false;
      await ctx.db.patch(row._id, {
        active: true,
        confirmedAt: row.confirmedAt ?? Date.now(),
      });
    } else
      await ctx.db.patch(row._id, {
        active: false,
        unsubscribedAt: Date.now(),
        email: "",
        expiresAt: Date.now(),
        generation: row.generation + 1,
      });
    return true;
  },
});
export const queue = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (process.env.WALL_ENVIRONMENT !== "production") return 0;
    const config = await settings(ctx);
    if (!config.rewardsEnabled || !config.promotionEnabled) return 0;
    const site = await getSite(ctx),
      count = site.totalTakeovers + (site.numberingOffset ?? 0);
    const next = [...config.milestones]
      .sort((a, b) => a.takeoverNumber - b.takeoverNumber)
      .find((m) => m.takeoverNumber > count);
    if (!next || next.takeoverNumber - count > 10) return 0;
    const rows = await ctx.db
      .query("milestoneSubscribers")
      .withIndex("by_active_milestone", (q) =>
        q.eq("active", true).lt("lastNotified", next.takeoverNumber),
      )
      .take(50);
    for (const s of rows) {
      if (!(await emailAllowed(ctx, s.email, "milestone_alert"))) continue;
      await mail(ctx, {
        key: `milestone-alert:${s._id}:${next.takeoverNumber}:${s.generation}`,
        kind: "milestone_alert",
        subscriberId: s._id,
        generation: s.generation,
        milestoneNumber: next.takeoverNumber,
        to: s.email,
        subject: `Milestone #${next.takeoverNumber.toLocaleString("en-US")} is approaching`,
        body: `At the time this alert was prepared, ${next.takeoverNumber - count} counted takeovers remained before milestone #${next.takeoverNumber.toLocaleString("en-US")}. The listed reward is $${next.rewardUsd.toLocaleString("en-US")}, subject to the Reward Rules and eligibility.\n\nNumbers are not reserved. The wall may have changed by the time you read this; check the live wall before paying. An alert does not guarantee a takeover number or a prize.`,
      });
      await ctx.db.patch(s._id, { lastNotified: next.takeoverNumber });
    }
    return rows.length;
  },
});
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("milestoneSubscribers")
      .withIndex("by_active_expiry", (q) =>
        q.eq("active", false).lt("expiresAt", Date.now() - 30 * 86400_000),
      )
      .take(50);
    for (const row of rows) await ctx.db.delete(row._id);
    return null;
  },
});

export async function requestSubscription(
  ctx: import("./_generated/server").MutationCtx,
  email: string,
) {
  if (!(await emailAllowed(ctx, email, "milestone_confirm"))) return null;
  const emailHash = sha(email.toLowerCase());
  const old = await ctx.db
    .query("milestoneSubscribers")
    .withIndex("by_email", (q) => q.eq("emailHash", emailHash))
    .unique();
  if (old?.active) return null;
  const seed = crypto.randomUUID() + crypto.randomUUID(),
    generation = (old?.generation ?? 0) + 1;
  const values = {
    confirmedAt: undefined,
    unsubscribedAt: undefined,
    email,
    emailHash,
    seed,
    confirmHash: sha(alertConfirmation(seed)),
    unsubscribeHash: sha(alertUnsubscribe(seed)),
    active: false,
    generation,
    expiresAt: Date.now() + 24 * 3600_000,
    lastNotified: old?.lastNotified ?? 0,
    createdAt: Date.now(),
  };
  const id = old
    ? old._id
    : await ctx.db.insert("milestoneSubscribers", values);
  if (old) await ctx.db.patch(id, values);
  await mail(ctx, {
    key: "milestone-confirm:" + id + ":" + generation,
    kind: "milestone_confirm",
    subscriberId: id,
    generation,
    to: email,
    subject: "Confirm your milestone alerts",
    body: "Confirm this request to get one email when a future milestone is within 10 counted takeovers. No number is reserved, and an alert does not guarantee a prize. If you did not request this, ignore this email. This confirmation expires in 24 hours.",
  });
}
