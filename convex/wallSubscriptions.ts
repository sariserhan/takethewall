import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { validateEmail } from "../lib/validation";
import { sha } from "../lib/audit";
import {
  wallConfirmation,
  wallUnsubscribe,
} from "../lib/wall-subscription-secrets";
import { limit, getSite } from "./model";
import { mail } from "./rewardModel";
import { ownerBaseUrl } from "../lib/owner-secrets";
import { rememberContact } from "./emailDirectory";
export const frequency = v.union(v.literal("every"), v.literal("daily"));
const nextDaily = (now: number) => {
  const today = Math.floor(now / 86400_000) * 86400_000 + 9 * 3600_000;
  return today > now ? today : today + 86400_000;
};
export const subscribe = internalMutation({
  args: {
    email: v.string(),
    frequency,
    consent: v.boolean(),
    honeypot: v.string(),
    ipHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    if (a.honeypot) return null;
    if (!a.consent) throw Error("Confirm that you want wall-change emails.");
    await limit(ctx, "wall-alert-ip:" + a.ipHash, 5, 3600_000);
    await limit(ctx, "wall-alert-global", 100, 3600_000);
    const email = validateEmail(a.email).toLowerCase(),
      emailHash = sha(email);
    await limit(ctx, "wall-alert-email:" + emailHash, 3, 3600_000);
    const old = await ctx.db
      .query("wallSubscribers")
      .withIndex("by_email", (q) => q.eq("emailHash", emailHash))
      .unique();
    // An unauthenticated signup must not change an existing confirmed preference.
    if (old?.active) return null;
    const seed = crypto.randomUUID() + crypto.randomUUID(),
      now = Date.now();
    const values = {
      unsubscribedAt: undefined,
      email,
      emailHash,
      seed,
      confirmHash: sha(wallConfirmation(seed)),
      unsubscribeHash: sha(wallUnsubscribe(seed)),
      active: false,
      frequency: a.frequency,
      generation: (old?.generation ?? 0) + 1,
      expiresAt: now + 86400_000,
      createdAt: now,
      lastSequence: 0,
      nextAt: now,
    };
    const id = old ? old._id : await ctx.db.insert("wallSubscribers", values);
    if (old) await ctx.db.patch(id, values);
    await rememberContact(ctx, email, "wall subscriber", now);
    await mail(ctx, {
      key: `wall-confirm:${id}:${values.generation}`,
      kind: "wall_confirm",
      wallSubscriberId: id,
      generation: values.generation,
      to: email,
      subject: "Confirm your wall-change emails",
      body: `Confirm to receive ${a.frequency === "every" ? "an email for every new takeover" : "a daily summary at 09:00 UTC when the wall has changed"}. This is separate from milestone alerts. If you did not request this, ignore this email. This link expires in 24 hours.`,
    });
    return null;
  },
});
export const manage = internalMutation({
  args: {
    token: v.string(),
    action: v.union(
      v.literal("confirm"),
      v.literal("unsubscribe"),
      v.literal("frequency"),
    ),
    frequency: v.optional(frequency),
  },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    if (!/^[a-f0-9]{64}$/.test(a.token)) return false;
    const row =
      a.action === "confirm"
        ? await ctx.db
            .query("wallSubscribers")
            .withIndex("by_confirm", (q) => q.eq("confirmHash", sha(a.token)))
            .unique()
        : await ctx.db
            .query("wallSubscribers")
            .withIndex("by_unsubscribe", (q) =>
              q.eq("unsubscribeHash", sha(a.token)),
            )
            .unique();
    if (!row) return false;
    if (a.action === "confirm") {
      if (!row.email || row.expiresAt <= Date.now()) return false;
      if (!row.active) {
        const site = await getSite(ctx);
        await ctx.db.patch(row._id, {
          active: true,
          lastSequence: site.currentActivationSequence,
          nextAt:
            row.frequency === "daily" ? nextDaily(Date.now()) : Date.now(),
        });
      }
    } else if (a.action === "unsubscribe") {
      if (row.email)
        await rememberContact(ctx, row.email, "wall subscriber", row.createdAt);
      await ctx.db.patch(row._id, {
        active: false,
        unsubscribedAt: Date.now(),
        generation: row.generation + 1,
        expiresAt: Date.now(),
      });
    } else {
      if (!row.active || !a.frequency) return false;
      await ctx.db.patch(row._id, {
        frequency: a.frequency,
        generation: row.generation + 1,
        nextAt: a.frequency === "daily" ? nextDaily(Date.now()) : Date.now(),
      });
    }
    return true;
  },
});
export const queue = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (process.env.WALL_ENVIRONMENT !== "production") return 0;
    const site = await getSite(ctx),
      now = Date.now();
    const subscribers = await ctx.db
      .query("wallSubscribers")
      .withIndex("by_due", (q) => q.eq("active", true).lte("nextAt", now))
      .take(20);
    let count = 0;
    for (const s of subscribers) {
      const rows = await ctx.db
        .query("takeovers")
        .withIndex("by_activationSequence", (q) =>
          q
            .gt("activationSequence", s.lastSequence)
            .lte("activationSequence", site.currentActivationSequence),
        )
        .order(s.frequency === "daily" ? "desc" : "asc")
        .take(20);
      const eligible = rows.filter(
        (t) =>
          !t.blocked &&
          t.status !== "rejected" &&
          ["paid", "admin_counted", "admin_placement"].includes(t.kind) &&
          t.publicTakeoverId,
      );
      if (s.frequency === "daily" && eligible.length) {
        const latest = eligible[0];
        await mail(ctx, {
          key: `wall-daily:${s._id}:${s.generation}:${Math.floor(now / 86400_000)}`,
          kind: "wall_daily",
          wallSubscriberId: s._id,
          wallTakeoverId: latest._id,
          wallTakeoverIds: eligible.map((t) => t._id),
          generation: s.generation,
          to: s.email,
          subject: "Your daily wall update",
          body: [
            "Here are the latest takeovers since your last update (up to 20). The wall may have changed again by the time you read this.",
            ...eligible.map(
              (t) =>
                `${t.displayName ?? t.domain}${t.takeoverNumber === undefined ? "" : ` · #${t.takeoverNumber + (site.numberingOffset ?? 0)}`}\n${t.description}\n${ownerBaseUrl()}/takeover/${t.publicTakeoverId}`,
            ),
          ].join("\n\n"),
        });
        count++;
      } else if (s.frequency === "every") {
        for (const t of eligible) {
          await mail(ctx, {
            key: `wall-change:${s._id}:${s.generation}:${t._id}`,
            kind: "wall_change",
            wallSubscriberId: s._id,
            wallTakeoverId: t._id,
            generation: s.generation,
            to: s.email,
            subject: `${t.displayName ?? t.domain} took the wall`,
            body: `${t.displayName ?? t.domain}${t.takeoverNumber === undefined ? "" : ` · Takeover #${t.takeoverNumber + (site.numberingOffset ?? 0)}`}\n\n${t.description}\n\nPublished ${new Date(t.activatedAt!).toISOString()}. Someone else may already own the live wall.`,
          });
          count++;
        }
      }
      await ctx.db.patch(s._id, {
        lastSequence:
          s.frequency === "daily"
            ? site.currentActivationSequence
            : (rows.at(-1)?.activationSequence ??
              site.currentActivationSequence),
        nextAt: s.frequency === "daily" ? nextDaily(now) : now + 60_000,
      });
    }
    return count;
  },
});
