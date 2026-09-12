import { numberingOffset } from "./numbering";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  requireAdmin,
  audit,
  mail,
  settings,
  systemMessage,
} from "./rewardModel";
import { disableCurrent } from "./operations";
import { linkToken } from "../lib/claim-secrets";
import { cascade } from "./rewards";
import { plainText, validateWallContent } from "../lib/content";
import { limit, zeros, daily, enqueue } from "./model";
import { auditHash } from "../lib/audit";
import { validateEmail } from "../lib/validation";
import { onActivation } from "./rewardModel";
import { internal } from "./_generated/api";
import { canonical, sha } from "../lib/audit";
import { settingsValue } from "./rewardSchema";
export const identity = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => requireAdmin(ctx),
});
export const overview = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const adminId = await requireAdmin(ctx);
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    const today = await ctx.db
      .query("dailyStats")
      .withIndex("by_date", (q) =>
        q.eq("date", new Date().toISOString().slice(0, 10)),
      )
      .unique();
    const claims = await ctx.db.query("rewardClaims").order("desc").take(100);
    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_status_updated", (q) => q.eq("status", "open"))
      .take(100);
    const mailFailures = await ctx.db
      .query("transactionalMail")
      .withIndex("by_state_next", (q) => q.eq("state", "failed"))
      .take(100);
    const milestones = await ctx.db
      .query("milestoneRewards")
      .withIndex("by_number")
      .take(100);
    return JSON.stringify({
      adminId,
      site: site ? { ...site, recordedTakeovers: site.totalTakeovers, totalTakeovers: site.totalTakeovers + (site.numberingOffset ?? 0) } : null,
      today,
      recentOpenClaims: claims.filter(
        (c) => !["paid", "expired", "ineligible"].includes(c.status),
      ).length,
      unreadConversations: claims.filter(
        (c) => c.lastWinnerMessageAt > c.lastAdminReadAt,
      ).length,
      openSupport: tickets.length,
      failedEmails: mailFailures.length,
      milestones: milestones.map((r) => ({
        number: r.milestoneNumber,
        status: r.status,
        candidate: r.candidateNumber,
      })),
      countsBoundedAt: 100,
    });
  },
});
// JSON is an admin-only transport; projections deliberately omit authentication secrets.
export const list = query({
  args: { section: v.string(), cursor: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const pagination = { numItems: 50, cursor: a.cursor ?? null };
    const page = <T>(
      result: { page: T[]; isDone: boolean; continueCursor: string },
      rows: unknown[] = result.page,
    ) =>
      JSON.stringify({
        rows,
        next: result.isDone ? null : result.continueCursor,
      });
    switch (a.section) {
      case "takeovers": {
        const offset = await numberingOffset(ctx);
        const rows = await ctx.db
          .query("takeovers")
          .order("desc")
          .paginate(pagination);
        return page(
          rows,
          await Promise.all(
            rows.page.map(async (t) => {
              const p = await ctx.db
                .query("purchases")
                .withIndex("by_takeoverId", (q) => q.eq("takeoverId", t._id))
                .unique();
              return {
                ...t,
                ...(offset && t.takeoverNumber !== undefined ? { auditSequenceNumber: t.takeoverNumber, takeoverNumber: t.takeoverNumber + offset } : {}),
                logoUrl: t.logoStorageId
                  ? await ctx.storage.getUrl(t.logoStorageId)
                  : null,
                amountCents: p?.amountCents ?? null,
                paymentIssue: p?.paymentIssue ?? null,
                paymentReference: p?.paymentIntentId ?? null,
              };
            }),
          ),
        );
      }
      case "milestones":
        return page(
          await ctx.db
            .query("milestoneRewards")
            .order("desc")
            .paginate(pagination),
        );
      case "claims":
      case "messages": {
        const rows = await ctx.db
          .query("rewardClaims")
          .order("desc")
          .paginate(pagination);
        return page(
          rows,
          await Promise.all(
            rows.page.map(async (c) => {
              const t = await ctx.db.get(c.takeoverId);
              const reward = await ctx.db.get(c.rewardId);
              const lastMessage = await ctx.db
                .query("rewardMessages")
                .withIndex("by_claim_created", (q) => q.eq("claimId", c._id))
                .order("desc")
                .first();
              return {
                _id: c._id,
                _creationTime: c._creationTime,
                takeoverNumber: c.takeoverNumber,
                displayName: t?.displayName ?? t?.domain,
                status: c.status,
                deadlineAt: c.deadlineAt,
                rewardUsd: reward?.rewardUsd,
                milestone: reward?.milestoneNumber,
                unread: c.lastWinnerMessageAt > c.lastAdminReadAt,
                lastMessage: lastMessage?.body.slice(0, 240) ?? "",
                updatedAt: Math.max(
                  c.lastWinnerMessageAt,
                  c.lastAdminMessageAt,
                  c.createdAt,
                ),
              };
            }),
          ),
        );
      }
      case "support":
        return page(
          await ctx.db
            .query("supportTickets")
            .order("desc")
            .paginate(pagination),
        );
      case "audit":
        return page(
          await ctx.db.query("adminAudit").order("desc").paginate(pagination),
        );
      default:
        throw new Error("Unknown admin section");
    }
  },
});
export const claim = query({
  args: { id: v.id("rewardClaims") },
  returns: v.string(),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const c = await ctx.db.get(a.id);
    if (!c) throw new Error("Claim not found");
    const messages = await ctx.db
      .query("rewardMessages")
      .withIndex("by_claim_created", (q) => q.eq("claimId", c._id))
      .order("desc")
      .take(100);
    const history = await ctx.db
      .query("adminAudit")
      .withIndex("by_target", (q) => q.eq("target", c._id))
      .order("desc")
      .take(100);
    const documents = await ctx.db
      .query("claimDocuments")
      .withIndex("by_claim", (q) => q.eq("claimId", c._id))
      .take(10);
    const reward = await ctx.db.get(c.rewardId);
    return JSON.stringify({
      claim: {
        id: c._id,
        status: c.status,
        takeoverNumber: c.takeoverNumber,
        email: c.email,
        legalName: c.legalName,
        country: c.country,
        region: c.region,
        dob: c.dob,
        declaration: c.declaration,
        deadlineAt: c.deadlineAt,
        requiredInformation: c.requiredInformation,
        privateReason: c.privateReason,
        rulesAcceptedAt: c.rulesAcceptedAt,
      },
      reward,
      messages: messages.reverse(),
      history,
      documents: documents.map((d) => ({
        id: d._id,
        request: d.request,
        uploaded: !!d.storageId,
        deletedAt: d.deletedAt,
      })),
    });
  },
});
export const ticket = query({
  args: { id: v.id("supportTickets") },
  returns: v.string(),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const ticket = await ctx.db.get(a.id);
    const messages = await ctx.db
      .query("supportMessages")
      .withIndex("by_ticket", (q) => q.eq("ticketId", a.id))
      .order("desc")
      .take(100);
    return JSON.stringify({ ticket, messages: messages.reverse() });
  },
});
export const message = mutation({
  args: { claimId: v.id("rewardClaims"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    await limit(ctx, "admin-chat:" + actor, 10);
    const c = await ctx.db.get(a.claimId);
    if (!c) throw new Error("Claim not found");
    const body = plainText(a.body, 5000, true, true);
    await ctx.db.insert("rewardMessages", {
      claimId: c._id,
      sender: "admin",
      adminId: actor,
      body,
      createdAt: Date.now(),
    });
    await ctx.db.patch(c._id, {
      lastAdminMessageAt: Date.now(),
      notifyAt: c.notifyAt ?? Date.now() + 600_000,
    });
    await audit(ctx, actor, "ADMIN_MESSAGE_SENT", c._id);
    return null;
  },
});
export const read = mutation({
  args: { claimId: v.id("rewardClaims") },
  returns: v.null(),
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    await ctx.db.patch(a.claimId, { lastAdminReadAt: Date.now() });
    return null;
  },
});
export const claimAction = mutation({
  args: {
    claimId: v.id("rewardClaims"),
    action: v.union(
      ...(
        [
          "request_information",
          "approve",
          "ineligible",
          "extend",
          "sent",
          "confirm",
          "resend",
          "request_document",
        ] as const
      ).map((x) => v.literal(x)),
    ),
    expectedStatus: v.string(),
    body: v.optional(v.string()),
    deadlineAt: v.optional(v.number()),
    reference: v.optional(v.string()),
    confirmed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx),
      c = await ctx.db.get(a.claimId);
    if (!c) throw new Error("Claim not found");
    const r = (await ctx.db.get(c.rewardId))!;
    if (c.status !== a.expectedStatus)
      throw new Error("Claim changed. Refresh before continuing.");
    if (a.action === "resend") {
      await limit(ctx, "claim-resend:" + c._id, 3, 3600_000);
      const seed =
        crypto.randomUUID() + crypto.randomUUID() + crypto.randomUUID();
      const generation = c.tokenVersion + 1;
      await ctx.db.patch(c._id, {
        tokenSeed: seed,
        tokenHash: sha(linkToken(seed)),
        tokenVersion: generation,
        otpUsed: true,
        otpHash: undefined,
        otpSeed: undefined,
      });
      await mail(ctx, {
        generation,
        key: `resend:${c._id}:${crypto.randomUUID()}`,
        kind: "claim_link",
        claimId: c._id,
        to: c.email,
        subject: "Your replacement TakeTheWall claim link",
        body: "Use this replacement link to access your reward portal. Previous sessions will be invalidated.",
      });
      await audit(ctx, actor, "CLAIM_LINK_RESEND", c._id);
      return null;
    }
    if (
      ["paid", "expired", "ineligible"].includes(c.status) ||
      r.claimId !== c._id
    )
      throw new Error("Claim is closed");
    if (
      ["ineligible", "confirm", "sent", "approve"].includes(a.action) &&
      !a.confirmed
    )
      throw new Error("Confirm this consequential action");
    if (a.action === "ineligible") {
      if (r.payoutStatus === "sent")
        throw new Error(
          "Reconcile the sent wire before disqualifying this claim",
        );
      await cascade(ctx, c._id, "ineligible", plainText(a.body, 1000), actor);
      return null;
    }
    let text = "";
    switch (a.action) {
      case "request_information": {
        if (c.status !== "under_review")
          throw new Error("Claim must be under review");
        const body = plainText(a.body, 5000, true, true);
        await ctx.db.patch(c._id, {
          requiredInformation: body,
          status: "additional_information_required",
          deadlineAt: Date.now() + r.additionalDays * 86400_000,
        });
        text =
          "Additional information requested. You have a separate submission deadline.";
        break;
      }
      case "extend": {
        if (
          ![
            "pending_claim",
            "code_verified",
            "information_required",
            "additional_information_required",
          ].includes(c.status) ||
          !a.deadlineAt ||
          a.deadlineAt <= Math.max(Date.now(), c.deadlineAt)
        )
          throw new Error("Choose a later active claimant deadline");
        const reason = plainText(a.body, 1000);
        await ctx.db.patch(c._id, { deadlineAt: a.deadlineAt });
        await audit(ctx, actor, "DEADLINE_EXTENDED", c._id, {
          reason,
          oldDeadline: c.deadlineAt,
          newDeadline: a.deadlineAt,
        });
        text = `Submission deadline extended to ${new Date(a.deadlineAt).toUTCString()}.`;
        break;
      }
      case "approve": {
        if (c.status !== "under_review" || !c.rulesAcceptedAt || !c.legalName)
          throw new Error(
            "Submitted eligibility information and rules acceptance required",
          );
        plainText(a.body, 1000);
        const p = await ctx.db
          .query("purchases")
          .withIndex("by_takeoverId", (q) => q.eq("takeoverId", c.takeoverId))
          .unique();
        if (p?.paymentIssue) throw new Error("Payment has an unresolved issue");
        const docs = await ctx.db
          .query("claimDocuments")
          .withIndex("by_claim", (q) => q.eq("claimId", c._id))
          .take(10);
        if (docs.some((d) => !d.storageId && !d.deletedAt))
          throw new Error("Requested documents are incomplete");
        await ctx.db.patch(c._id, { status: "approved" });
        await ctx.db.patch(r._id, {
          status: "approved",
          payoutStatus: "pending",
          awardedAt: Date.now(),
        });
        text = "Claim approved. Payout is pending.";
        break;
      }
      case "sent": {
        if (
          !(await settings(ctx)).payoutsEnabled ||
          c.status !== "approved" ||
          r.payoutStatus !== "pending"
        )
          throw new Error("Payout is not ready or payouts are disabled");
        const reference = plainText(a.reference, 200);
        await ctx.db.patch(r._id, {
          payoutStatus: "sent",
          payoutReference: reference,
          sentAt: Date.now(),
          payoutAdminId: actor,
        });
        text = "Manual wire transfer marked as sent. Confirmation is pending.";
        break;
      }
      case "confirm": {
        if (
          !(await settings(ctx)).payoutsEnabled ||
          c.status !== "approved" ||
          r.payoutStatus !== "sent"
        )
          throw new Error(
            "A sent payout must be confirmed while payouts are enabled",
          );
        const p = await ctx.db
          .query("purchases")
          .withIndex("by_takeoverId", (q) => q.eq("takeoverId", c.takeoverId))
          .unique();
        if (p?.paymentIssue)
          throw new Error("Resolve the payment issue before confirming payout");
        const t = (await ctx.db.get(c.takeoverId))!;
        const frozen = !!t.replacedAt && Date.now() >= t.replacedAt + 120_000;
        await ctx.db.patch(r._id, {
          status: "paid",
          payoutStatus: "confirmed",
          paidAt: Date.now(),
          payoutAdminId: actor,
          winnerTakeoverId: t._id,
          snapshot: {
            displayName: t.displayName ?? t.domain,
            contentType: t.contentType ?? "link",
            linkType: t.linkType ?? "website",
            websiteUrl: t.websiteUrl,
            description: t.description,
            ...(t.logoStorageId ? { logoStorageId: t.logoStorageId } : {}),
            activatedAt: t.activatedAt!,
            ...(t.replacedAt ? { replacedAt: t.replacedAt } : {}),
            impressions: t.impressions,
            uniqueVisitors: t.uniqueVisitors,
            clicks: t.clicks,
            statsFrozen: frozen,
          },
        });
        await ctx.db.patch(c._id, { status: "paid" });
        const docs = await ctx.db
          .query("claimDocuments")
          .withIndex("by_claim", (q) => q.eq("claimId", c._id))
          .take(10);
        for (const d of docs)
          if (!d.retentionOverride && !d.deletedAt)
            await ctx.db.patch(d._id, {
              deleteAt: Date.now() + 90 * 86400_000,
            });
        await audit(
          ctx,
          actor,
          "PERMANENT_WALL_PUBLISHED",
          r._id,
          {},
          `Takeover #${c.takeoverNumber} received the reward.`,
        );
        text = "Reward payment confirmed. Permanent wall published.";
        break;
      }
      case "request_document": {
        if (c.status !== "under_review")
          throw new Error("Review the submitted claim first");
        const docs = await ctx.db
          .query("claimDocuments")
          .withIndex("by_claim", (q) => q.eq("claimId", c._id))
          .take(10);
        if (docs.length >= 10)
          throw new Error("Maximum ten documents per claim");
        await ctx.db.insert("claimDocuments", {
          claimId: c._id,
          request: plainText(a.body, 1000),
          requestedAt: Date.now(),
        });
        await ctx.db.patch(c._id, {
          status: "additional_information_required",
          requiredInformation: plainText(a.body, 1000),
          deadlineAt: Date.now() + r.additionalDays * 86400_000,
        });
        text =
          "A private document was requested. Upload it in the claim checklist.";
        break;
      }
    }
    await audit(
      ctx,
      actor,
      {
        approve: "CLAIM_APPROVED",
        confirm: "REWARD_PAID",
        sent: "PAYOUT_SENT",
        request_information: "ADDITIONAL_INFORMATION_REQUESTED",
        request_document: "DOCUMENT_REQUESTED",
        extend: "CLAIM_DEADLINE_UPDATED",
      }[a.action],
      c._id,
      { reason: a.body ?? "" },
    );
    await systemMessage(ctx, c._id, text);
    await mail(ctx, {
      key: `action:${c._id}:${crypto.randomUUID()}`,
      kind: a.action,
      claimId: c._id,
      to: c.email,
      subject: "Your TakeTheWall reward claim was updated",
      body: text,
    });
    return null;
  },
});
export const moderate = mutation({
  args: {
    takeoverId: v.optional(v.id("takeovers")),
    rewardId: v.optional(v.id("milestoneRewards")),
    reason: v.string(),
    removeLive: v.optional(v.boolean()),
    confirmed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    if (!a.confirmed) throw new Error("Confirm link disabling");
    const reason = plainText(a.reason, 1000);
    if (a.removeLive) {
      if (!a.takeoverId) throw new Error("Live takeover required");
      await disableCurrent(ctx, {
        expectedCurrentId: a.takeoverId,
        reason,
        operatorReference: "admin:" + crypto.randomUUID(),
      });
      await audit(ctx, actor, "LIVE_CONTENT_REMOVED", a.takeoverId, { reason });
    }
    if (a.takeoverId)
      await ctx.db.patch(a.takeoverId, { outboundLinkEnabled: false });
    else if (a.rewardId)
      await ctx.db.patch(a.rewardId, { outboundLinkEnabled: false });
    else throw new Error("Target required");
    await audit(
      ctx,
      actor,
      "OUTBOUND_LINK_DISABLED",
      a.takeoverId ?? a.rewardId!,
      { reason },
    );
    return null;
  },
});
export const supportAction = mutation({
  args: {
    id: v.id("supportTickets"),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("in_progress"),
        v.literal("resolved"),
        v.literal("spam"),
      ),
    ),
    reply: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    const t = await ctx.db.get(a.id);
    if (!t) throw new Error("Ticket not found");
    if (a.status) {
      await ctx.db.patch(t._id, { status: a.status, updatedAt: Date.now() });
      await audit(ctx, actor, "SUPPORT_STATUS_CHANGED", t._id, {
        status: a.status,
      });
    }
    if (a.reply) {
      if(!t.email)throw new Error("This report has no reply email.");
      const body = plainText(a.reply, 10000, true, true);
      const id = await ctx.db.insert("supportMessages", {
        ticketId: t._id,
        body,
        adminId: actor,
        createdAt: Date.now(),
      });
      await mail(ctx, {
        key: "support:" + id,
        kind: "support",
        ticketId: t._id,
        to: t.email,
        subject: "TakeTheWall Support",
        body,
      });
      await audit(ctx, actor, "SUPPORT_REPLY_SENT", t._id);
    }
    return null;
  },
});
export const getSettings = query({
  args: {},
  returns: settingsValue,
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return settings(ctx);
  },
});
export const saveSettings = mutation({
  args: { value: settingsValue },
  returns: v.null(),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    const value = a.value;
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    const old = await settings(ctx);
    const current = (site?.totalTakeovers ?? 0) + (site?.numberingOffset ?? 0);
    if (
      value.milestones.length > 100 ||
      value.milestones.some(
        (m) =>
          !Number.isSafeInteger(m.takeoverNumber) ||
          m.takeoverNumber < 1 ||
          !Number.isSafeInteger(m.rewardUsd) ||
          m.rewardUsd < 1,
      ) ||
      new Set(value.milestones.map((m) => m.takeoverNumber)).size !==
        value.milestones.length
    )
      throw new Error("Use unique positive integer milestones and USD rewards");
    for (const m of old.milestones.filter((m) => m.takeoverNumber <= current)) {
      const next = value.milestones.find(
        (n) => n.takeoverNumber === m.takeoverNumber,
      );
      if (!next || next.rewardUsd !== m.rewardUsd)
        throw new Error("Reached definitions cannot change");
    }
    if (
      value.milestones.some(
        (m) =>
          m.takeoverNumber <= current &&
          !old.milestones.some((n) => n.takeoverNumber === m.takeoverNumber),
      )
    )
      throw new Error("New milestones must be in the future");
    if (
      !Number.isInteger(value.initialDays) ||
      value.initialDays < 1 ||
      value.initialDays > 365 ||
      !Number.isInteger(value.additionalDays) ||
      value.additionalDays < 1 ||
      value.additionalDays > 365
    )
      throw new Error("Deadlines must be 1–365 days");
    plainText(value.rulesVersion, 80);
    if (value.rulesJson.length > 50000) throw new Error("Rules too large");
    const rules = JSON.parse(value.rulesJson);
    if (!rules || typeof rules !== "object" || Array.isArray(rules))
      throw new Error("Rules must be a JSON object");
    if (
      value.initialDays !== old.initialDays ||
      value.additionalDays !== old.additionalDays
    ) {
      rules.claims = `Submit an initial claim within ${value.initialDays} calendar days. Internal review does not consume a claimant deadline. Additional information has a separate ${value.additionalDays}-day deadline. Audited extensions are possible.`;
    }
    value.rulesJson = canonical({
      ...rules,
      currency: "USD",
      version: value.rulesVersion,
      milestones: value.milestones,
      initialClaimDays: value.initialDays,
      additionalInformationDays: value.additionalDays,
    });
    const hash = sha(value.rulesJson);
    const r = await ctx.db
      .query("rewardRules")
      .withIndex("by_version", (q) => q.eq("version", value.rulesVersion))
      .unique();
    if (r && r.hash !== hash)
      throw new Error("Published rules versions are immutable");
    if (
      (value.initialDays !== old.initialDays ||
        value.additionalDays !== old.additionalDays ||
        canonical(value.milestones) !== canonical(old.milestones)) &&
      value.rulesVersion === old.rulesVersion
    )
      throw new Error("Rule changes require a new rules version");
    if (!r)
      await ctx.db.insert("rewardRules", {
        version: value.rulesVersion,
        json: value.rulesJson,
        hash,
        createdAt: Date.now(),
      });
    const row = await ctx.db
      .query("rewardSettings")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    if (row) await ctx.db.patch(row._id, { value });
    else await ctx.db.insert("rewardSettings", { key: "current", value });
    await audit(ctx, actor, "FUTURE_SETTINGS_UPDATED", "settings", {
      rulesVersion: value.rulesVersion,
      hash,
    });
    return null;
  },
});

// Admin issuance is a separate authorization path, never a Stripe bypass flag.
export const publish = mutation({
  args: {
    contentType: v.union(v.literal("link"), v.literal("personal")),
    websiteUrl: v.string(),
    displayName: v.string(),
    description: v.string(),
    countTowardMilestones: v.boolean(),
    recipientEmail: v.string(),
    reason: v.string(),
    requestKey: v.string(),
    expectedCurrentId: v.union(v.id("takeovers"), v.null()),
  },
  returns: v.id("takeovers"),
  handler: async (ctx, a) => {
    const actor = await requireAdmin(ctx);
    const requestKey = "admin:" + actor + ":" + plainText(a.requestKey, 100);
    const content = validateWallContent(a);
    const reason = plainText(a.reason, 1000);
    const email = a.countTowardMilestones
      ? validateEmail(a.recipientEmail)
      : "";
    const fingerprint = sha(
      canonical({ content, reason, email, counted: a.countTowardMilestones }),
    );
    const prior = await ctx.db
      .query("purchases")
      .withIndex("by_requestKey", (q) => q.eq("requestKey", requestKey))
      .unique();
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new Error(
          "This publish request was already used with different content.",
        );
      return prior.takeoverId;
    }
    await limit(ctx, "admin-publish:" + actor, 30);
    const site = await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique();
    if ((site?.currentTakeoverId ?? null) !== a.expectedCurrentId)
      throw new Error(
        "The wall changed. Review the current owner before publishing again.",
      );
    if (
      a.countTowardMilestones &&
      site &&
      (site.auditMigrationCursor !== undefined ||
        (site.totalTakeovers > 0 && !site.auditHash))
    )
      throw new Error(
        "Complete the history migration before issuing a counted takeover.",
      );
    const now = Date.now(),
      sequence = site ? site.currentActivationSequence + 1 : 0;
    const previous = site ? await ctx.db.get(site.currentTakeoverId) : null;
    const id = await ctx.db.insert("takeovers", {
      ...content,
      kind: a.countTowardMilestones ? "admin_counted" : "admin_placement",
      status: "active",
      blocked: false,
      createdAt: now,
      activatedAt: now,
      activationSequence: sequence,
      ...zeros,
    });
    // Retain an explicit $0 issuance/recipient record for retries and reward claims.
    // No paidAt, Checkout session, payment intent or payment event is fabricated.
    await ctx.db.insert("purchases", {
      takeoverId: id,
      buyerEmail: email,
      requestKey,
      fingerprint,
      tokenHash: sha(requestKey),
      tokenExpiresAt: 0,
      checkoutExpiresAt: 0,
      environment:
        process.env.WALL_ENVIRONMENT === "production" ? "production" : "test",
      createdAt: now,
      contactDeleteAt: now + 365 * 86400_000,
      amountCents: 0,
      currency: "usd",
      issuedByAdmin: actor,
      issuedAt: now,
    });
    if (previous) {
      await ctx.db.patch(previous._id, {
        status: "replaced",
        replacedAt: now,
        endReason: "admin",
      });
      if (previous.kind === "paid" || previous.kind === "admin_counted")
        await enqueue(ctx, "replacement_email", previous._id);
    }
    const siteId =
      site?._id ??
      (await ctx.db.insert("siteStats", {
        key: "wall",
        currentTakeoverId: id,
        currentActivationSequence: sequence,
        totalVisitors: 0,
        totalTakeovers: 0,
        updatedAt: now,
      }));
    await ctx.db.patch(siteId, {
      currentTakeoverId: id,
      currentActivationSequence: sequence,
      updatedAt: now,
    });
    if (a.countTowardMilestones) {
      const number = (site?.totalTakeovers ?? 0) + 1;
      const payload = {
        takeoverNumber: number,
        publicTakeoverId: "ttw_" + crypto.randomUUID().replaceAll("-", ""),
        activatedAt: now,
        amountCents: 0,
        currency: "usd",
        contentHash: auditHash({
          type: content.contentType,
          linkType: content.linkType,
          destinationUrl: content.websiteUrl,
          displayName: content.displayName,
          description: content.description,
          imageStorageId: null,
        }),
        previousAuditHash: site?.auditHash ?? "",
      };
      const hash = auditHash(payload);
      await ctx.db.insert("takeoverAudit", {
        ...payload,
        takeoverId: id,
        auditHash: hash,
      });
      await ctx.db.patch(id, {
        takeoverNumber: number,
        publicTakeoverId: payload.publicTakeoverId,
        previousAuditHash: payload.previousAuditHash,
        auditHash: hash,
      });
      await ctx.db.patch(siteId, { totalTakeovers: number, auditHash: hash });
      const day = await daily(ctx);
      await ctx.db.patch(day._id, { takeovers: day.takeovers + 1 });
      await onActivation(ctx, number + (site?.numberingOffset ?? 0));
      if (number % 100 === 0)
        await ctx.scheduler.runAfter(0, internal.auditTrail.checkpoint, {});
      await enqueue(ctx, "activation_email", id);
      await enqueue(ctx, "takeover_activated", id);
    }
    await audit(
      ctx,
      actor,
      "ADMIN_PUBLISH",
      id,
      { reason, counted: a.countTowardMilestones, amountCents: 0 },
      a.countTowardMilestones
        ? "Admin-issued counted takeover; $0 collected."
        : "Admin placement; excluded from milestone count.",
    );
    return id;
  },
});
