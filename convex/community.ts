import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, requireAdmin } from "./rewardModel";
const event = v.object({
  enabled: v.boolean(),
  title: v.string(),
  description: v.string(),
  start: v.number(),
  end: v.number(),
});
const settingsValue = v.object({
  crumblingEnabled: v.boolean(),
  gazetteEnabled: v.boolean(),
  gazetteAuto: v.boolean(),
  event: v.union(event, v.null()),
});
const card = v.object({
  publicId: v.string(),
  name: v.string(),
  description: v.string(),
  image: v.union(v.string(), v.null()),
  since: v.number(),
  until: v.union(v.number(), v.null()),
});
async function settings(ctx: QueryCtx) {
  return ctx.db
    .query("growthSettings")
    .withIndex("by_key", (q) => q.eq("key", "current"))
    .unique();
}
async function eligible(ctx: QueryCtx, t: Doc<"takeovers">) {
  if (
    !t.publicTakeoverId ||
    t.activatedAt === undefined ||
    t.blocked ||
    !["active", "replaced"].includes(t.status) ||
    !["paid", "admin_counted"].includes(t.kind)
  )
    return false;
  const p = await ctx.db
    .query("purchases")
    .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
    .unique();
  return (
    !!p &&
    p.environment === "production" &&
    !p.paymentIssue &&
    (p.paidAt !== undefined || p.issuedAt !== undefined)
  );
}
async function project(ctx: QueryCtx, t: Doc<"takeovers">) {
  return {
    publicId: t.publicTakeoverId!,
    name: t.displayName ?? t.domain,
    description: t.description,
    image: t.logoStorageId ? await ctx.storage.getUrl(t.logoStorageId) : null,
    since: t.activatedAt!,
    until: t.replacedAt ?? null,
  };
}
async function saveSettings(
  ctx: MutationCtx,
  patch: Partial<Doc<"growthSettings">>,
) {
  const s = await settings(ctx);
  if (s) await ctx.db.patch(s._id, patch);
  else
    await ctx.db.insert("growthSettings", {
      key: "current",
      historyEnabled: true,
      ...patch,
    });
}
export const controls = query({
  args: {},
  returns: settingsValue,
  handler: async (ctx) => {
    const s = await settings(ctx);
    return {
      crumblingEnabled: s?.crumblingEnabled ?? false,
      gazetteEnabled: s?.gazetteEnabled ?? false,
      gazetteAuto: s?.gazetteAuto ?? false,
      event: s?.communityEvent ?? null,
    };
  },
});
export const configure = mutation({
  args: {
    feature: v.union(
      v.literal("crumblingEnabled"),
      v.literal("gazetteEnabled"),
      v.literal("gazetteAuto"),
    ),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    await saveSettings(ctx, { [a.feature]: a.enabled });
    await audit(ctx, actor, "COMMUNITY_VISIBILITY_CHANGED", "growth", a);
    return null;
  },
});
export const scheduleEvent = mutation({
  args: { event },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    const e = a.event;
    if (
      !e.title.trim() ||
      e.title.length > 100 ||
      e.description.length > 500 ||
      !Number.isSafeInteger(e.start) ||
      !Number.isSafeInteger(e.end) ||
      e.start < 0 ||
      e.end > 8640000000000000 ||
      e.end <= e.start ||
      e.end - e.start > 86400000
    )
      throw new Error(
        "Enter a title and a valid event lasting at most 24 hours.",
      );
    await saveSettings(ctx, {
      communityEvent: { ...e, title: e.title.trim() },
    });
    await audit(ctx, actor, "COMMUNITY_EVENT_SAVED", "growth", a);
    return null;
  },
});
export const history = query({
  args: { limit: v.optional(v.number()) },
  returns: v.union(
    v.null(),
    v.object({ entries: v.array(card), next: v.union(v.number(), v.null()) }),
  ),
  handler: async (ctx, a) => {
    const s = await settings(ctx);
    if (!s?.crumblingEnabled || s.historyEnabled === false) return null;
    const limit = a.limit ?? 10;
    if (!Number.isSafeInteger(limit) || limit < 10 || limit > 100)
      throw new Error("Invalid history limit.");
    const rows = await ctx.db
      .query("takeovers")
      .withIndex("by_activationSequence", (q) => q.gte("activationSequence", 0))
      .order("desc")
      .take(limit);
    const entries = [];
    for (const t of rows)
      if (t.status === "replaced" && (await eligible(ctx, t)))
        entries.push(await project(ctx, t));
    return {
      entries,
      next:
        rows.length === limit && limit < 100 ? Math.min(100, limit + 10) : null,
    };
  },
});
const issue = v.object({
  id: v.id("gazetteIssues"),
  date: v.string(),
  headline: v.string(),
  body: v.string(),
  status: v.union(v.literal("draft"), v.literal("published")),
  revision: v.number(),
  entries: v.array(card),
});
async function projectIssue(ctx: QueryCtx, i: Doc<"gazetteIssues">) {
  const entries = [];
  for (const id of i.sources) {
    const t = await ctx.db.get(id);
    if (t && (await eligible(ctx, t))) entries.push(await project(ctx, t));
  }
  return {
    id: i._id,
    date: i.date,
    headline: i.headline,
    body: i.body,
    status: i.status,
    revision: i.revision,
    entries,
  };
}
export const issues = query({
  args: {},
  returns: v.array(issue),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("gazetteIssues")
      .withIndex("by_date")
      .order("desc")
      .take(12);
    return Promise.all(rows.map((i) => projectIssue(ctx, i)));
  },
});
export const gazette = query({
  args: {},
  returns: v.union(v.null(), issue),
  handler: async (ctx) => {
    if (!(await settings(ctx))?.gazetteEnabled) return null;
    const i = await ctx.db
      .query("gazetteIssues")
      .withIndex("by_status_date", (q) => q.eq("status", "published"))
      .order("desc")
      .first();
    return i ? projectIssue(ctx, i) : null;
  },
});
async function draft(
  ctx: MutationCtx,
  date: string,
): Promise<Id<"gazetteIssues">> {
  const start = Date.parse(date + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(start) ||
    new Date(start).toISOString().slice(0, 10) !== date ||
    start + 86400000 > Date.now()
  )
    throw new Error("Choose a completed UTC date.");
  const old = await ctx.db
    .query("gazetteIssues")
    .withIndex("by_date", (q) => q.eq("date", date))
    .unique();
  if (old) return old._id;
  const rows = await ctx.db
    .query("takeovers")
    .withIndex("by_activatedAt", (q) =>
      q.gte("activatedAt", start).lt("activatedAt", start + 86400000),
    )
    .order("desc")
    .take(100);
  const sources: Id<"takeovers">[] = [];
  for (const t of rows) {
    if (await eligible(ctx, t)) sources.push(t._id);
    if (sources.length === 12) break;
  }
  return ctx.db.insert("gazetteIssues", {
    date,
    headline: "Another day on the wall.",
    body: "A selection of public placements from this UTC day. Explore the projects and the time they spent on the wall.",
    status: "draft",
    sources,
    revision: 0,
    createdAt: Date.now(),
  });
}
export const createDraft = mutation({
  args: { date: v.string() },
  returns: v.id("gazetteIssues"),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    const id = await draft(ctx, a.date);
    await audit(ctx, actor, "GAZETTE_DRAFT_CREATED", String(id), a);
    return id;
  },
});
export const midnight = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if ((await settings(ctx))?.gazetteAuto)
      await draft(
        ctx,
        new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      );
    return null;
  },
});
export const review = mutation({
  args: {
    id: v.id("gazetteIssues"),
    headline: v.string(),
    body: v.string(),
    publish: v.boolean(),
    revision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    const i = await ctx.db.get(a.id);
    if (!i || i.revision !== a.revision)
      throw new Error("This issue changed. Reload before saving.");
    if (
      !a.headline.trim() ||
      a.headline.length > 140 ||
      !a.body.trim() ||
      a.body.length > 3000
    )
      throw new Error(
        "Enter a headline (140 characters) and story (3000 characters).",
      );
    if (a.publish && !(await projectIssue(ctx, i)).entries.length)
      throw new Error(
        "An issue needs an eligible public placement before publication.",
      );
    await ctx.db.patch(a.id, {
      headline: a.headline.trim(),
      body: a.body.trim(),
      status: a.publish ? "published" : "draft",
      revision: i.revision + 1,
    });
    await audit(
      ctx,
      actor,
      a.publish ? "GAZETTE_PUBLISHED" : "GAZETTE_DRAFT_SAVED",
      String(a.id),
      {},
    );
    return null;
  },
});
