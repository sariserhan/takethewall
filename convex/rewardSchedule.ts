import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
export async function scheduleRewardDeadline(
  ctx: MutationCtx,
  deadline: number,
) {
  for (const at of new Set([
    deadline - 3 * 86400_000,
    deadline - 86400_000,
    deadline,
  ]))
    await ctx.scheduler.runAt(
      Math.max(Date.now(), at),
      internal.rewards.maintain,
      {},
    );
}
