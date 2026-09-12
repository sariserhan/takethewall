import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ownerToken, ownerUnsubscribeToken } from "../lib/owner-secrets";
import { sha } from "../lib/audit";
export async function ensureOwnerAccess(
  ctx: MutationCtx,
  takeoverId: Id<"takeovers">,
) {
  const p = await ctx.db
    .query("purchases")
    .withIndex("by_takeoverId", (q) => q.eq("takeoverId", takeoverId))
    .unique();
  if (!p || (!p.paidAt && !p.issuedAt) || !p.buyerEmail) return null;
  const existing = await ctx.db
    .query("ownerAccess")
    .withIndex("by_takeover", (q) => q.eq("takeoverId", takeoverId))
    .unique();
  if (existing) {
    const tokenHash = sha(ownerToken(existing.seed)),
      unsubscribeHash = sha(ownerUnsubscribeToken(existing.seed));
    if (
      existing.tokenHash !== tokenHash ||
      existing.unsubscribeHash !== unsubscribeHash
    ) {
      await ctx.db.patch(existing._id, { tokenHash, unsubscribeHash });
      return { ...existing, tokenHash, unsubscribeHash };
    }
    return existing;
  }
  const seed = crypto.randomUUID() + crypto.randomUUID();
  const id = await ctx.db.insert("ownerAccess", {
    takeoverId,
    seed,
    tokenHash: sha(ownerToken(seed)),
    unsubscribeHash: sha(ownerUnsubscribeToken(seed)),
    weeklyDigestEnabled: p.weeklyDigestEnabled !== false,
    createdAt: Date.now(),
  });
  return ctx.db.get(id);
}
export async function ownerAccess(ctx: QueryCtx, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid private link");
  const access = await ctx.db
    .query("ownerAccess")
    .withIndex("by_token", (q) => q.eq("tokenHash", sha(token)))
    .unique();
  if (!access) throw new Error("Invalid private link");
  return access;
}
