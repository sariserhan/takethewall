import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  audit,
  createCandidate,
  mail,
  requireClaim,
  settings,
  systemMessage,
} from "./rewardModel";
import { plainText } from "../lib/content";
import { limit } from "./model";
import { snapshot } from "./rewardSchema";
const sequenceRow = v.object({
  number: v.number(),
  displayName: v.union(v.string(), v.null()),
  publicTakeoverId: v.union(v.string(), v.null()),
  auditHash: v.union(v.string(), v.null()),
  activatedAt: v.union(v.number(), v.null()),
  status: v.union(v.string(), v.null()),
});
export const publicMilestone = v.object({
  number: v.number(),
  rewardUsd: v.number(),
  status: v.string(),
  candidateNumber: v.number(),
  rulesVersion: v.string(),
  rulesHash: v.union(v.string(), v.null()),
  paidAt: v.union(v.number(), v.null()),
  snapshot: v.union(snapshot, v.null()),
  logoUrl: v.union(v.string(), v.null()),
  outboundLinkEnabled: v.boolean(),
  sequence: v.array(sequenceRow),
});
export const overview = query({
  args: {},
  returns: v.object({
    currentNumber: v.number(),
    promotionEnabled: v.boolean(),
    milestones: v.array(publicMilestone),
  }),
  handler: async (ctx) => {
    const config = await settings(ctx);
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    const reached = await ctx.db
      .query("milestoneRewards")
      .withIndex("by_number")
      .take(100);
    const definitions = [...config.milestones];
    for (const r of reached)
      if (!definitions.some((m) => m.takeoverNumber === r.milestoneNumber))
        definitions.push({
          takeoverNumber: r.milestoneNumber,
          rewardUsd: r.rewardUsd,
        });
    const milestones = await Promise.all(
      definitions
        .sort((a, b) => a.takeoverNumber - b.takeoverNumber)
        .map(async (m) => {
          const r = reached.find((x) => x.milestoneNumber === m.takeoverNumber);
          const candidate = r?.candidateNumber ?? m.takeoverNumber;
          const sequence = [];
          if (r) {
            for (let n = Math.max(1, candidate - 3); n <= candidate + 3; n++) {
              const t = await ctx.db
                .query("takeovers")
                .withIndex("by_takeoverNumber", (q) =>
                  q.eq("takeoverNumber", n),
                )
                .unique();
              const claims = t
                ? await ctx.db
                    .query("rewardClaims")
                    .withIndex("by_takeover", (q) => q.eq("takeoverId", t._id))
                    .take(100)
                : [];
              sequence.push({
                number: n,
                displayName: t?.displayName ?? t?.domain ?? null,
                publicTakeoverId: t?.publicTakeoverId ?? null,
                auditHash: t?.auditHash ?? null,
                activatedAt: t?.activatedAt ?? null,
                status:
                  claims.find((c) => c.rewardId === r._id)?.status ?? null,
              });
            }
          }
          let trophy = r?.snapshot ?? null;
          if (trophy && !trophy.statsFrozen && r?.winnerTakeoverId) {
            const t = await ctx.db.get(r.winnerTakeoverId);
            if (t)
              trophy = {
                ...trophy,
                impressions: t.impressions,
                uniqueVisitors: t.uniqueVisitors,
                clicks: t.clicks,
                ...(t.replacedAt ? { replacedAt: t.replacedAt } : {}),
              };
          }
          return {
            number: m.takeoverNumber,
            rewardUsd: r?.rewardUsd ?? m.rewardUsd,
            status: r?.status ?? "future",
            candidateNumber: candidate,
            rulesVersion: r?.rulesVersion ?? config.rulesVersion,
            rulesHash: r?.rulesHash ?? null,
            paidAt: r?.paidAt ?? null,
            snapshot: trophy,
            logoUrl: trophy?.logoStorageId
              ? await ctx.storage.getUrl(trophy.logoStorageId)
              : null,
            outboundLinkEnabled: r?.outboundLinkEnabled ?? false,
            sequence,
          };
        }),
    );
    return {
      currentNumber: site?.totalTakeovers ?? 0,
      promotionEnabled: config.promotionEnabled,
      milestones,
    };
  },
});
export const rules = query({
  args: { version: v.optional(v.string()) },
  returns: v.object({
    version: v.string(),
    hash: v.string(),
    json: v.string(),
  }),
  handler: async (ctx, a) => {
    const s = await settings(ctx);
    const r = await ctx.db
      .query("rewardRules")
      .withIndex("by_version", (q) =>
        q.eq("version", a.version ?? s.rulesVersion),
      )
      .unique();
    if (a.version && a.version !== s.rulesVersion && !r)
      throw new Error("Unknown rules version");
    const { sha } = await import("../lib/audit");
    return r
      ? { version: r.version, hash: r.hash, json: r.json }
      : { version: s.rulesVersion, hash: sha(s.rulesJson), json: s.rulesJson };
  },
});
export const portal = query({
  args: { session: v.string() },
  returns: v.object({
    claimId: v.id("rewardClaims"),
    number: v.number(),
    milestone: v.number(),
    amount: v.number(),
    status: v.string(),
    deadlineAt: v.number(),
    requiredInformation: v.string(),
    legalName: v.string(),
    country: v.string(),
    region: v.string(),
    dob: v.string(),
    rulesVersion: v.string(),
    payoutStatus: v.string(),
    messages: v.array(
      v.object({
        id: v.id("rewardMessages"),
        sender: v.string(),
        body: v.string(),
        createdAt: v.number(),
      }),
    ),
    unread: v.number(),
    documents: v.array(
      v.object({
        id: v.id("claimDocuments"),
        request: v.string(),
        uploaded: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx, a) => {
    const c = await requireClaim(ctx, a.session);
    const r = (await ctx.db.get(c.rewardId))!;
    const messages = await ctx.db
      .query("rewardMessages")
      .withIndex("by_claim_created", (q) => q.eq("claimId", c._id))
      .order("desc")
      .take(100);
    const docs = await ctx.db
      .query("claimDocuments")
      .withIndex("by_claim", (q) => q.eq("claimId", c._id))
      .take(10);
    return {
      claimId: c._id,
      number: c.takeoverNumber,
      milestone: r.milestoneNumber,
      amount: r.rewardUsd,
      status: c.status,
      deadlineAt: c.deadlineAt,
      requiredInformation: c.requiredInformation ?? "",
      legalName: c.legalName ?? "",
      country: c.country ?? "",
      region: c.region ?? "",
      dob: c.dob ?? "",
      rulesVersion: r.rulesVersion,
      payoutStatus: r.payoutStatus ?? "pending",
      messages: messages
        .reverse()
        .map((m) => ({
          id: m._id,
          sender: m.sender,
          body: m.body,
          createdAt: m.createdAt,
        })),
      unread: messages.filter(
        (m) => m.sender === "admin" && m.createdAt > c.lastWinnerReadAt,
      ).length,
      documents: docs
        .filter((d) => !d.deletedAt)
        .map((d) => ({
          id: d._id,
          request: d.request,
          uploaded: !!d.storageId,
        })),
    };
  },
});
export const submit = mutation({
  args: {
    session: v.string(),
    legalName: v.string(),
    country: v.string(),
    region: v.string(),
    dob: v.string(),
    declaration: v.string(),
    acceptRules: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await requireClaim(ctx, a.session);
    if (
      ![
        "pending_claim",
        "code_verified",
        "information_required",
        "additional_information_required",
      ].includes(c.status) ||
      c.deadlineAt <= Date.now()
    )
      throw new Error("Claim is not accepting information");
    if (!a.acceptRules) throw new Error("Accept the Reward Rules");
    const country = a.country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country))
      throw new Error("Use a two-letter residence country code");
    const dob = Date.parse(a.dob);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(a.dob) ||
      !Number.isFinite(dob) ||
      new Date(dob).toISOString().slice(0, 10) !== a.dob ||
      dob > Date.now() ||
      dob < Date.now() - 125 * 365.25 * 86400_000
    )
      throw new Error("Enter a valid date of birth");
    await ctx.db.patch(c._id, {
      legalName: plainText(a.legalName, 200),
      country,
      region: plainText(a.region, 100, false),
      dob: a.dob,
      declaration: plainText(a.declaration, 5000, false),
      rulesAcceptedAt: Date.now(),
      submittedAt: Date.now(),
      status: "under_review",
    });
    await ctx.db.patch(c.rewardId, { status: "under_review" });
    await audit(ctx, "winner", "CLAIM_SUBMITTED", c._id);
    await systemMessage(
      ctx,
      c._id,
      "Claim information submitted. Review time does not count against your submission deadline.",
    );
    return null;
  },
});
export const send = mutation({
  args: { session: v.string(), body: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await requireClaim(ctx, a.session);
    await limit(ctx, "winner-chat:" + c._id, 10);
    if (["expired", "ineligible"].includes(c.status))
      throw new Error("This claim is closed; contact support");
    const body = plainText(a.body, 5000);
    await ctx.db.insert("rewardMessages", {
      claimId: c._id,
      body,
      sender: "winner",
      createdAt: Date.now(),
    });
    await ctx.db.patch(c._id, { lastWinnerMessageAt: Date.now() });
    return null;
  },
});
export const read = mutation({
  args: { session: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await requireClaim(ctx, a.session);
    await ctx.db.patch(c._id, {
      lastWinnerReadAt: Date.now(),
      notifyAt: undefined,
    });
    return null;
  },
});
export async function cascade(
  ctx: Parameters<typeof createCandidate>[0],
  claimId: Parameters<typeof systemMessage>[1],
  status: "expired" | "ineligible",
  reason: string,
  actor: string,
) {
  const c = await ctx.db.get(claimId);
  if (!c || ["paid", "expired", "ineligible"].includes(c.status)) return;
  const r = (await ctx.db.get(c.rewardId))!;
  if (r.claimId !== c._id || r.status === "paid") return;
  await ctx.db.patch(c._id, { status, privateReason: reason });
  await audit(
    ctx,
    actor,
    status === "expired" ? "CLAIM_EXPIRED" : "CLAIM_INELIGIBLE",
    c._id,
    { reason },
  );
  await audit(
    ctx,
    actor,
    "REWARD_CASCADED",
    r._id,
    { from: c.takeoverNumber, to: c.takeoverNumber + 1 },
    `Takeover #${c.takeoverNumber} is ${status}.`,
  );
  await systemMessage(ctx, c._id, `Claim ${status}.`);
  await mail(ctx, {
    key: `closed:${c._id}`,
    kind: status,
    claimId: c._id,
    to: c.email,
    subject: `TakeTheWall claim ${status}`,
    body: `Your milestone claim is ${status}. Contact support with questions.`,
  });
  await ctx.db.patch(r._id, {
    payoutStatus: undefined,
    payoutReference: undefined,
    sentAt: undefined,
    payoutAdminId: undefined,
  });
  await createCandidate(ctx, r._id, c.takeoverNumber + 1);
}
export const maintain = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    for (const status of [
      "pending_claim",
      "code_verified",
      "information_required",
      "additional_information_required",
    ] as const) {
      const claims = await ctx.db
        .query("rewardClaims")
        .withIndex("by_status_deadline", (q) =>
          q.eq("status", status).lte("deadlineAt", now + 3 * 86400_000),
        )
        .take(100);
      for (const c of claims) {
        if (c.deadlineAt <= now)
          await cascade(
            ctx,
            c._id,
            "expired",
            "Claimant submission deadline elapsed",
            "system",
          );
        else if (
          c.deadlineAt - now <= 86400_000 ||
          status !== "additional_information_required"
        )
          await mail(ctx, {
            key: `reminder:${c._id}:${c.deadlineAt}:${c.deadlineAt - now <= 86400_000 ? "24h" : "3d"}`,
            kind: "reminder",
            claimId: c._id,
            to: c.email,
            subject: "TakeTheWall claim deadline reminder",
            body: `Your submission deadline is ${new Date(c.deadlineAt).toUTCString()}.`,
          });
      }
    }
    const awaiting = await ctx.db
      .query("milestoneRewards")
      .withIndex("by_status_candidate", (q) =>
        q.eq("status", "awaiting_successor"),
      )
      .take(100);
    for (const r of awaiting)
      await createCandidate(ctx, r._id, r.candidateNumber);
    const paid = await ctx.db
      .query("milestoneRewards")
      .withIndex("by_status_candidate", (q) => q.eq("status", "paid"))
      .take(100);
    for (const r of paid) {
      if (!r.snapshot?.statsFrozen && r.winnerTakeoverId) {
        const t = await ctx.db.get(r.winnerTakeoverId);
        if (t?.replacedAt && now >= t.replacedAt + 120_000)
          await ctx.db.patch(r._id, {
            snapshot: {
              ...r.snapshot!,
              replacedAt: t.replacedAt,
              impressions: t.impressions,
              uniqueVisitors: t.uniqueVisitors,
              clicks: t.clicks,
              statsFrozen: true,
            },
          });
      }
    }
    const notify = await ctx.db
      .query("rewardClaims")
      .withIndex("by_notifyAt", (q) => q.gt("notifyAt", 0).lte("notifyAt", now))
      .take(100);
    for (const c of notify) {
      if (c.lastAdminMessageAt > c.lastWinnerReadAt)
        await mail(ctx, {
          key: `chat:${c._id}:${c.notifyAt}`,
          kind: "chat",
          claimId: c._id,
          to: c.email,
          subject: "TakeTheWall sent you a reward message",
          body: "You have unread messages in your protected reward portal.",
        });
      await ctx.db.patch(c._id, {
        notifyAt: undefined,
        notificationThrough: c.lastAdminMessageAt,
      });
    }
    const sessions = await ctx.db
      .query("claimSessions")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
      .take(100);
    for (const s of sessions) await ctx.db.delete(s._id);
    const docs = await ctx.db
      .query("claimDocuments")
      .withIndex("by_deleteAt", (q) => q.gt("deleteAt", 0).lte("deleteAt", now))
      .take(30);
    for (const d of docs) {
      if (d.storageId) await ctx.storage.delete(d.storageId);
      await ctx.db.patch(d._id, {
        storageId: undefined,
        deletedAt: now,
        deleteAt: undefined,
      });
      await audit(ctx, "system", "DOCUMENT_DELETED", d._id);
    }
    return null;
  },
});
