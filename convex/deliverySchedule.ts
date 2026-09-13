import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
export async function scheduleDelivery(
  ctx: MutationCtx,
  source: "jobs" | "mail",
  id: Id<"jobs"> | Id<"transactionalMail">,
  earliest = Date.now(),
) {
  if (earliest > Date.now() + 1000) {
    await ctx.scheduler.runAt(earliest, internal.delivery.queue, {
      source,
      id,
    });
    return;
  }
  const clock = await ctx.db
    .query("deliveryClock")
    .withIndex("by_key", (q) => q.eq("key", "email"))
    .unique();
  const at = Math.max(Date.now(), earliest, clock?.nextAt ?? 0);
  // Shared across both legacy stores: <= 48 starts/minute, with overlapping I/O.
  if (clock) await ctx.db.patch(clock._id, { nextAt: at + 1250 });
  else
    await ctx.db.insert("deliveryClock", { key: "email", nextAt: at + 1250 });
  await ctx.scheduler.runAt(at, internal.delivery.deliver, { source, id });
}
