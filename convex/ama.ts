import { v } from "convex/values";
import { query, internalQuery, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mail } from "./rewardModel";
import { ownerAccess } from "./ownerModel";
import { getSite, limit } from "./model";
const row = v.object({
  id: v.id("amaQuestions"),
  question: v.string(),
  answer: v.union(v.string(), v.null()),
});
async function live(ctx: QueryCtx, id: Id<"takeovers">) {
  const t = await ctx.db.get(id);
  return (
    !!t &&
    !t.blocked &&
    t.status === "active" &&
    (await getSite(ctx)).currentTakeoverId === id
  );
}
async function rows(
  ctx: QueryCtx,
  id: Id<"takeovers">,
  state: "pending" | "answered",
) {
  const data = await ctx.db
    .query("amaQuestions")
    .withIndex("by_owner_state", (q) =>
      q.eq("takeoverId", id).eq("state", state),
    )
    .order("desc")
    .take(state === "pending" ? 50 : 20);
  return data.map((r) => ({
    id: r._id,
    question: r.question,
    answer: r.answer ?? null,
  }));
}
export const current = query({
  args: { takeoverId: v.id("takeovers") },
  returns: v.union(v.null(), v.object({ answers: v.array(row) })),
  handler: async (ctx, a) => {
    const t = await ctx.db.get(a.takeoverId);
    if (!t?.amaEnabled || !(await live(ctx, a.takeoverId))) return null;
    return { answers: await rows(ctx, a.takeoverId, "answered") };
  },
});
export const inbox = internalQuery({
  args: { token: v.string() },
  returns: v.object({
    enabled: v.boolean(),
    live: v.boolean(),
    pending: v.array(row),
    answers: v.array(row),
  }),
  handler: async (ctx, a) => {
    const access = await ownerAccess(ctx, a.token);
    const t = await ctx.db.get(access.takeoverId);
    return {
      enabled: t?.amaEnabled ?? false,
      live: await live(ctx, access.takeoverId),
      pending: await rows(ctx, access.takeoverId, "pending"),
      answers: await rows(ctx, access.takeoverId, "answered"),
    };
  },
});
export const ask = internalMutation({
  args: {
    takeoverId: v.id("takeovers"),
    question: v.string(),
    ipHash: v.string(),
    honeypot: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    if (a.honeypot) return null;
    const t = await ctx.db.get(a.takeoverId);
    if (!t?.amaEnabled || !(await live(ctx, a.takeoverId)))
      throw new Error("This AMA has closed.");
    const question = a.question.trim();
    if (question.length < 3 || question.length > 240 || !a.ipHash)
      throw new Error("Enter a question of 3–240 characters.");
    await limit(ctx, "ama-ask:" + a.ipHash, 3, 600000);
    await limit(ctx, "ama-wall:" + a.takeoverId, 30, 60000);
    const pending = await ctx.db
      .query("amaQuestions")
      .withIndex("by_owner_state", (q) =>
        q.eq("takeoverId", a.takeoverId).eq("state", "pending"),
      )
      .take(100);
    if (pending.length >= 100) throw new Error("The owner has a full inbox.");
    await ctx.db.insert("amaQuestions", {
      takeoverId: a.takeoverId,
      question,
      state: "pending",
      createdAt: Date.now(),
    });
    if (t.amaBatchSince === undefined) {
      const since = Date.now();
      await ctx.db.patch(t._id, { amaBatchSince: since });
      await ctx.scheduler.runAfter(5 * 60_000, internal.ama.notify, {
        takeoverId: t._id,
        since,
      });
    }
    return null;
  },
});
export const notify = internalMutation({
  args: { takeoverId: v.id("takeovers"), since: v.number() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const t = await ctx.db.get(a.takeoverId);
    if (!t || t.amaBatchSince !== a.since) return null;
    await ctx.db.patch(t._id, { amaBatchSince: undefined });
    if (!t.amaEnabled || !(await live(ctx, t._id))) return null;
    const questions = await ctx.db
      .query("amaQuestions")
      .withIndex("by_owner_state", (q) =>
        q
          .eq("takeoverId", t._id)
          .eq("state", "pending")
          .gte("createdAt", a.since),
      )
      .take(100);
    if (!questions.length) return null;
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
      .unique();
    if (!purchase?.buyerEmail) return null;
    await mail(ctx, {
      key: `ama:${t._id}:${a.since}`,
      kind: "ama_questions",
      to: purchase.buyerEmail,
      subject: "New questions for your wall",
      body: `${questions.length} new ${questions.length === 1 ? "question is" : "questions are"} waiting for you about “${t.displayName}”.\n\nOpen your private owner dashboard to review and answer. Questions stay private until you publish an answer.\n\nWe group questions over five minutes. Turn off “Accept questions during this reign” in your dashboard to stop questions and these notifications.`,
      wallTakeoverId: t._id,
    });
    return null;
  },
});
export const manage = internalMutation({
  args: {
    token: v.string(),
    enabled: v.optional(v.boolean()),
    questionId: v.optional(v.id("amaQuestions")),
    answer: v.optional(v.string()),
    dismiss: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const access = await ownerAccess(ctx, a.token);
    if (a.enabled !== undefined) {
      if (a.enabled && !(await live(ctx, access.takeoverId)))
        throw new Error("Your reign has ended.");
      await ctx.db.patch(access.takeoverId, { amaEnabled: a.enabled });
      return null;
    }
    if (!a.questionId) throw new Error("Choose a question.");
    const q = await ctx.db.get(a.questionId);
    if (!q || q.takeoverId !== access.takeoverId)
      throw new Error("Question unavailable.");
    if (a.dismiss) {
      await ctx.db.patch(q._id, { state: "dismissed", answer: undefined });
      return null;
    }
    if (!(await live(ctx, access.takeoverId)))
      throw new Error("Your reign has ended.");
    const answer = a.answer?.trim();
    if (!answer || answer.length > 600)
      throw new Error("Enter an answer of up to 600 characters.");
    if (q.state !== "pending")
      throw new Error("This question is already handled.");
    await ctx.db.patch(q._id, { answer, state: "answered" });
    return null;
  },
});
