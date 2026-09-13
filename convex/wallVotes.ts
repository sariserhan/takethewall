import { v } from "convex/values";
import { query, internalQuery, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getSite, limit } from "./model";
const choice = v.union(v.literal("keep"), v.literal("yeet"));
async function active(ctx: QueryCtx, id: Id<"takeovers">) {
  const t = await ctx.db.get(id);
  return (
    !!t &&
    !t.blocked &&
    t.status === "active" &&
    (await getSite(ctx)).currentTakeoverId === id
  );
}
export const totals = query({
  args: { takeoverId: v.id("takeovers") },
  returns: v.union(v.null(), v.object({ keep: v.number(), yeet: v.number() })),
  handler: async (ctx, a) => {
    if (!(await active(ctx, a.takeoverId))) return null;
    const rows = await ctx.db
      .query("wallVoteTotals")
      .withIndex("by_owner_shard", (q) => q.eq("takeoverId", a.takeoverId))
      .take(8);
    return rows.reduce(
      (sum, r) => ({ keep: sum.keep + r.keep, yeet: sum.yeet + r.yeet }),
      { keep: 0, yeet: 0 },
    );
  },
});
export const mine = internalQuery({
  args: { takeoverId: v.id("takeovers"), voterHash: v.string() },
  returns: v.union(choice, v.null()),
  handler: async (ctx, a) => {
    if (!(await active(ctx, a.takeoverId))) return null;
    const vote = await ctx.db
      .query("wallVotes")
      .withIndex("by_owner_voter", (q) =>
        q.eq("takeoverId", a.takeoverId).eq("voterHash", a.voterHash),
      )
      .unique();
    return vote?.choice ?? null;
  },
});
export const cast = internalMutation({
  args: {
    takeoverId: v.id("takeovers"),
    voterHash: v.string(),
    ipHash: v.string(),
    choice,
  },
  returns: choice,
  handler: async (ctx, a) => {
    if (!/^[a-f0-9]{64}$/.test(a.voterHash) || !a.ipHash)
      throw new Error("Invalid voter.");
    if (!(await active(ctx, a.takeoverId)))
      throw new Error("The wall changed. Vote on the new owner.");
    const old = await ctx.db
      .query("wallVotes")
      .withIndex("by_owner_voter", (q) =>
        q.eq("takeoverId", a.takeoverId).eq("voterHash", a.voterHash),
      )
      .unique();
    if (old?.choice === a.choice) return a.choice;
    await limit(ctx, "wall-vote-ip:" + a.ipHash, 20);
    await limit(ctx, "wall-vote-browser:" + a.voterHash, 10);
    const shard = parseInt(a.voterHash.slice(0, 2), 16) % 8;
    const total = await ctx.db
      .query("wallVoteTotals")
      .withIndex("by_owner_shard", (q) =>
        q.eq("takeoverId", a.takeoverId).eq("shard", shard),
      )
      .unique();
    const counts = {
      keep:
        (total?.keep ?? 0) +
        (a.choice === "keep" ? 1 : 0) -
        (old?.choice === "keep" ? 1 : 0),
      yeet:
        (total?.yeet ?? 0) +
        (a.choice === "yeet" ? 1 : 0) -
        (old?.choice === "yeet" ? 1 : 0),
    };
    if (total) await ctx.db.patch(total._id, counts);
    else
      await ctx.db.insert("wallVoteTotals", {
        takeoverId: a.takeoverId,
        shard,
        ...counts,
      });
    if (old) await ctx.db.patch(old._id, { choice: a.choice });
    else
      await ctx.db.insert("wallVotes", {
        takeoverId: a.takeoverId,
        voterHash: a.voterHash,
        choice: a.choice,
      });
    return a.choice;
  },
});
