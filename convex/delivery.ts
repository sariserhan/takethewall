import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { sendOne as sendJob } from "./jobs";
import { sendOne as sendMail } from "./mail";
import { scheduleDelivery } from "./deliverySchedule";
export const deliver = internalAction({
  args: {
    source: v.union(v.literal("jobs"), v.literal("mail")),
    id: v.union(v.id("jobs"), v.id("transactionalMail")),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    if (a.source === "jobs") {
      await sendJob(ctx, a.id as import("./_generated/dataModel").Id<"jobs">);
    } else
      await sendMail(
        ctx,
        a.id as import("./_generated/dataModel").Id<"transactionalMail">,
      );
    return null;
  },
});
// Safety net for pre-upgrade jobs or interrupted scheduled actions.
export const recover = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    for (const state of ["pending", "sending"] as const) {
      const jobs = await ctx.db
        .query("jobs")
        .withIndex("by_state_nextAt", (q) =>
          q.eq("state", state).lte("nextAt", now),
        )
        .take(30);
      const mail = await ctx.db
        .query("transactionalMail")
        .withIndex("by_state_next", (q) =>
          q.eq("state", state).lte("nextAt", now),
        )
        .take(30);
      for (const j of jobs)
        await scheduleDelivery(ctx, "jobs", j._id, j.nextAt);
      for (const j of mail)
        await scheduleDelivery(ctx, "mail", j._id, j.nextAt);
    }
    return null;
  },
});

export const queue = internalMutation({
  args: {
    source: v.union(v.literal("jobs"), v.literal("mail")),
    id: v.union(v.id("jobs"), v.id("transactionalMail")),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    await scheduleDelivery(ctx, a.source, a.id);
    return null;
  },
});
