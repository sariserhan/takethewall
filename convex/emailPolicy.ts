import type { MutationCtx, QueryCtx } from "./_generated/server";
import { sha } from "../lib/audit";
export const optionalEmailKinds = new Set([
  "wall_confirm",
  "wall_change",
  "wall_daily",
  "milestone_confirm",
  "milestone_alert",
  "weekly_digest_email",
]);
export type StopReason = "hard_bounce" | "spam_complaint" | "admin_unsubscribe";
export const emailHash = (email: string) => sha(email.trim().toLowerCase());
export async function policyFor(ctx: QueryCtx, email: string) {
  return ctx.db
    .query("emailPolicies")
    .withIndex("by_email", (q) => q.eq("emailHash", emailHash(email)))
    .unique();
}
export async function emailAllowed(ctx: QueryCtx, email: string, kind: string) {
  const policy = await policyFor(ctx, email);
  return (
    !policy?.deletedAt && !(policy?.reason && optionalEmailKinds.has(kind))
  );
}
export async function disableSubscriptions(
  ctx: MutationCtx,
  hash: string,
  at: number,
) {
  const wall = await ctx.db
    .query("wallSubscribers")
    .withIndex("by_email", (q) => q.eq("emailHash", hash))
    .unique();
  if (wall && (wall.active || wall.expiresAt > at))
    await ctx.db.patch(wall._id, {
      active: false,
      unsubscribedAt: at,
      expiresAt: at,
      generation: wall.generation + 1,
    });
  const milestone = await ctx.db
    .query("milestoneSubscribers")
    .withIndex("by_email", (q) => q.eq("emailHash", hash))
    .unique();
  if (milestone && (milestone.active || milestone.expiresAt > at))
    await ctx.db.patch(milestone._id, {
      active: false,
      unsubscribedAt: at,
      expiresAt: at,
      generation: milestone.generation + 1,
    });
}
export async function suppressEmail(
  ctx: MutationCtx,
  email: string,
  reason: StopReason,
  at: number,
) {
  const hash = emailHash(email),
    old = await policyFor(ctx, email);
  // Delivery success, late webhooks, and repeated signups never clear a suppression.
  const priority = { admin_unsubscribe: 0, hard_bounce: 1, spam_complaint: 2 };
  if (!old)
    await ctx.db.insert("emailPolicies", {
      emailHash: hash,
      reason,
      stoppedAt: at,
    });
  else if (!old.reason || priority[reason] > priority[old.reason])
    await ctx.db.patch(old._id, { reason, stoppedAt: at });
  await disableSubscriptions(ctx, hash, at);
}
export async function applyProviderSuppression(
  ctx: MutationCtx,
  email: string,
  providerId: string,
) {
  const [complaint, bounce] = await Promise.all([
    ctx.db
      .query("emailEvents")
      .withIndex("by_provider_type", (q) =>
        q.eq("providerId", providerId).eq("type", "email.complained"),
      )
      .first(),
    ctx.db
      .query("emailEvents")
      .withIndex("by_provider_type", (q) =>
        q
          .eq("providerId", providerId)
          .eq("type", "email.bounced")
          .eq("bounceType", "Permanent"),
      )
      .first(),
  ]);
  if (complaint)
    await suppressEmail(ctx, email, "spam_complaint", complaint.occurredAt);
  else if (bounce)
    await suppressEmail(ctx, email, "hard_bounce", bounce.occurredAt);
}
