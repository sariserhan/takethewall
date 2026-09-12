import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { wallConfirmation } from "../lib/wall-subscription-secrets";
import { alertConfirmation } from "../lib/alert-secrets";
import { emailAllowed } from "../convex/emailPolicy";
const modules = import.meta.glob("../convex/**/*.ts"),
  email = "reader@example.com";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
  vi.stubEnv(
    "CLAIM_TOKEN_SECRET",
    "test-secret-for-contact-controls-at-least-32",
  );
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  vi.stubEnv("ADMIN_USER_IDS", "admin-test");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function setup() {
  const t = convexTest(schema, modules),
    now = Date.now();
  const logo = await t.run((ctx) => ctx.storage.store(new Blob(["logo"])));
  await t.mutation(internal.wall.seed, { logoStorageId: logo });
  const { takeoverId, purchaseId } = await t.run(async (ctx) => {
    const site = (await ctx.db.query("siteStats").first())!;
    const takeoverId = site.currentTakeoverId;
    await ctx.db.patch(takeoverId, {
      kind: "paid",
      publicTakeoverId: "ttw_" + "a".repeat(32),
    });
    const purchaseId = await ctx.db.insert("purchases", {
      takeoverId,
      buyerEmail: email,
      receiptEmail: "receipt@example.com",
      requestKey: "request",
      fingerprint: "fingerprint",
      tokenHash: "hash",
      tokenExpiresAt: now + 86400_000,
      checkoutExpiresAt: now + 86400_000,
      environment: "production",
      createdAt: now,
      contactDeleteAt: now + 365 * 86400_000,
      paidAt: now,
    });
    return { takeoverId, purchaseId };
  });
  await t.mutation(internal.owners.ensureAccess, { takeoverId });
  await t.mutation(internal.wallSubscriptions.subscribe, {
    email,
    frequency: "every",
    consent: true,
    honeypot: "",
    ipHash: "ip",
  });
  await t.mutation(internal.milestoneAlerts.subscribe, {
    email,
    consent: true,
    honeypot: "",
    ipHash: "ip",
  });
  const [wall, milestone] = await t.run(
    async (ctx) =>
      [
        (await ctx.db.query("wallSubscribers").first())!,
        (await ctx.db.query("milestoneSubscribers").first())!,
      ] as const,
  );
  await t.mutation(internal.wallSubscriptions.manage, {
    action: "confirm",
    token: wallConfirmation(wall.seed),
  });
  await t.mutation(internal.milestoneAlerts.manage, {
    action: "confirm",
    token: alertConfirmation(milestone.seed),
  });
  await t.mutation(internal.emailDirectory.track, {
    key: "delivered-message",
    email,
    kind: "wall_change",
    subject: "Takeover",
    state: "accepted",
    providerId: "provider-id",
  });
  return {
    t,
    wall,
    milestone,
    takeoverId,
    purchaseId,
    admin: t.withIdentity({ subject: "admin-test" }),
  };
}
it.each(["Transient", "Temporary", "Undetermined"])(
  "does not suppress %s bounces or delivery delays",
  async (bounceType) => {
    const { t } = await setup();
    await t.mutation(internal.emailDelivery.record, {
      eventId: "bounce",
      emailId: "provider-id",
      type: "email.bounced",
      bounceType,
      occurredAt: Date.now(),
    });
    await t.mutation(internal.emailDelivery.record, {
      eventId: "delay",
      emailId: "provider-id",
      type: "email.delivery_delayed",
      occurredAt: Date.now(),
    });
    expect(await t.run((ctx) => emailAllowed(ctx, email, "wall_change"))).toBe(
      true,
    );
    expect(
      await t.run((ctx) => ctx.db.query("emailPolicies").first()),
    ).toBeNull();
  },
);
it.each(["email.bounced", "email.complained"] as const)(
  "%s stops optional messages without blocking service mail",
  async (type) => {
    const { t, wall, milestone, takeoverId } = await setup();
    const queued = await t.run((ctx) =>
      ctx.db.insert("transactionalMail", {
        key: "queued-wall",
        kind: "wall_change",
        wallSubscriberId: wall._id,
        wallTakeoverId: takeoverId,
        generation: wall.generation,
        to: email,
        subject: "Queued wall",
        body: "Owner content",
        state: "pending",
        attempts: 0,
        nextAt: Date.now(),
        createdAt: Date.now(),
      }),
    );
    await t.mutation(internal.emailDelivery.record, {
      eventId: "stop",
      emailId: "provider-id",
      type,
      ...(type === "email.bounced" ? { bounceType: "Permanent" } : {}),
      occurredAt: Date.now(),
    });
    expect((await t.run((ctx) => ctx.db.get(wall._id)))?.active).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(milestone._id)))?.active).toBe(
      false,
    );
    expect(await t.mutation(internal.mail.prepare, { id: queued })).toBeNull();
    for (const kind of [
      "wall_confirm",
      "milestone_confirm",
      "weekly_digest_email",
    ])
      expect(await t.run((ctx) => emailAllowed(ctx, email, kind))).toBe(false);
    expect(
      await t.run((ctx) => emailAllowed(ctx, email, "activation_email")),
    ).toBe(true);
    expect(await t.run((ctx) => emailAllowed(ctx, email, "otp"))).toBe(true);
    const generation = (await t.run((ctx) => ctx.db.get(wall._id)))!.generation;
    await t.mutation(internal.emailDelivery.record, {
      eventId: "stop",
      emailId: "provider-id",
      type,
      bounceType: "Permanent",
      occurredAt: Date.now(),
    });
    await t.mutation(internal.emailDelivery.record, {
      eventId: "delivered-later",
      emailId: "provider-id",
      type: "email.delivered",
      occurredAt: Date.now() + 1,
    });
    expect((await t.run((ctx) => ctx.db.get(wall._id)))?.generation).toBe(
      generation,
    );
    expect(await t.run((ctx) => emailAllowed(ctx, email, "wall_change"))).toBe(
      false,
    );
    await t.mutation(internal.wallSubscriptions.subscribe, {
      email,
      frequency: "daily",
      consent: true,
      honeypot: "",
      ipHash: "ip",
    });
    expect((await t.run((ctx) => ctx.db.get(wall._id)))?.active).toBe(false);
    expect(
      await t.mutation(internal.wallSubscriptions.manage, {
        token: wallConfirmation(wall.seed),
        action: "confirm",
      }),
    ).toBe(false);
  },
);
it("matches an early hard-bounce webhook even after many later provider events", async () => {
  const { t } = await setup();
  await t.mutation(internal.emailDelivery.record, {
    eventId: "early",
    emailId: "early-provider",
    type: "email.bounced",
    bounceType: "Permanent",
    occurredAt: Date.now(),
  });
  for (let i = 0; i < 24; i++)
    await t.mutation(internal.emailDelivery.record, {
      eventId: "later" + i,
      emailId: "early-provider",
      type: "email.delivered",
      occurredAt: Date.now() + i + 1,
    });
  expect(await t.run((ctx) => emailAllowed(ctx, email, "wall_change"))).toBe(
    true,
  );
  await t.mutation(internal.emailDirectory.track, {
    key: "early-send",
    email,
    kind: "wall_change",
    subject: "Early",
    state: "accepted",
    providerId: "early-provider",
  });
  expect(await t.run((ctx) => emailAllowed(ctx, email, "wall_change"))).toBe(
    false,
  );
});
it("admin unsubscribe records consent dates and guards both new and already queued digests", async () => {
  const { t, admin, wall, takeoverId } = await setup();
  await expect(
    t.mutation(api.contactManagement.unsubscribe, { email }),
  ).rejects.toThrow("Administrator");
  await expect(
    t
      .withIdentity({ subject: "other" })
      .query(api.contactManagement.details, { email }),
  ).rejects.toThrow("Administrator");
  const details = JSON.parse(
    await admin.query(api.contactManagement.details, { email }),
  );
  expect(details.wall.confirmedAt).toBe(Date.now());
  expect(details.milestone.confirmedAt).toBe(Date.now());
  const job = await t.run((ctx) =>
    ctx.db.insert("jobs", {
      key: "weekly-test",
      kind: "weekly_digest_email",
      takeoverId,
      deliveryId: "weekly-test",
      timestamp: Date.now(),
      state: "pending",
      attempts: 0,
      nextAt: Date.now(),
    }),
  );
  await admin.mutation(api.contactManagement.unsubscribe, { email });
  expect(
    (await t.query(internal.jobs.data, { id: job }))?.deliveryAllowed,
  ).toBe(false);
  expect(await t.mutation(internal.owners.queueWeeklyDigest, {})).toBe(false);
  await t.mutation(internal.emailDelivery.record, {
    eventId: "complaint",
    emailId: "provider-id",
    type: "email.complained",
    occurredAt: Date.now(),
  });
  await admin.mutation(api.contactManagement.unsubscribe, { email });
  expect(
    JSON.parse(await admin.query(api.contactManagement.details, { email }))
      .reason,
  ).toBe("spam_complaint");
  await t.run((ctx) => ctx.db.patch(wall._id, { confirmedAt: undefined }));
  expect(
    JSON.parse(await admin.query(api.contactManagement.details, { email })).wall
      .confirmedAt,
  ).toBeNull();
});
it("deletes contact fields in resumable batches, preserves other contacts/payments, and prevents resurrection", async () => {
  const { t, admin, purchaseId, takeoverId } = await setup();
  const { ticket, claim } = await t.run(async (ctx) => {
    const ticket = await ctx.db.insert("supportTickets", {
      name: "Reader",
      email,
      topic: "support",
      message: "My contact info",
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    for (let i = 0; i < 65; i++)
      await ctx.db.insert("supportMessages", {
        ticketId: ticket,
        adminId: "admin",
        body: "Contact information " + i,
        createdAt: Date.now(),
      });
    await ctx.db.insert("supportTickets", {
      name: "Other",
      email: "other@example.com",
      topic: "support",
      message: "Keep me",
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const reward = await ctx.db.insert("milestoneRewards", {
      milestoneNumber: 100,
      rewardUsd: 100,
      originalCandidateNumber: 100,
      candidateNumber: 100,
      status: "pending_claim",
      rulesVersion: "test",
      rulesHash: "hash",
      initialDays: 7,
      additionalDays: 7,
      outboundLinkEnabled: false,
    });
    const claim = await ctx.db.insert("rewardClaims", {
      rewardId: reward,
      takeoverId,
      takeoverNumber: 100,
      email,
      status: "pending_claim",
      deadlineAt: Date.now() + 86400_000,
      createdAt: Date.now(),
      tokenVersion: 1,
      tokenHash: "private-hash",
      tokenSeed: "private-seed",
      otpAttempts: 0,
      otpUsed: false,
      lastWinnerReadAt: 0,
      lastAdminReadAt: 0,
      lastWinnerMessageAt: 0,
      lastAdminMessageAt: 0,
    });
    await ctx.db.insert("adminAudit", {
      actor: email,
      action: "TEST",
      target: "test",
      metadata: JSON.stringify({ email, other: "other@example.com" }),
      createdAt: Date.now(),
    });
    return { ticket, claim };
  });
  await expect(
    t.mutation(api.contactManagement.erase, { email, confirmation: email }),
  ).rejects.toThrow("Administrator");
  await expect(
    admin.mutation(api.contactManagement.erase, {
      email,
      confirmation: "wrong@example.com",
    }),
  ).rejects.toThrow("Type");
  await admin.mutation(api.contactManagement.erase, {
    email,
    confirmation: email,
  });
  expect(
    await t.run((ctx) => ctx.db.query("emailContacts").first()),
  ).toBeNull();
  expect(
    await t.run((ctx) => emailAllowed(ctx, email, "activation_email")),
  ).toBe(false);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    JSON.parse(await admin.query(api.contactManagement.details, { email }))
      .deletionState,
  ).toBe("complete");
  expect(await t.run((ctx) => ctx.db.get(purchaseId))).toMatchObject({
    buyerEmail: "",
    receiptEmail: "receipt@example.com",
    paidAt: expect.any(Number),
  });
  expect(await t.run((ctx) => ctx.db.get(takeoverId))).not.toBeNull();
  expect(await t.run((ctx) => ctx.db.query("ownerAccess").first())).toBeNull();
  expect(
    await t.run((ctx) => ctx.db.query("wallSubscribers").first()),
  ).toBeNull();
  expect(
    await t.run((ctx) => ctx.db.query("milestoneSubscribers").first()),
  ).toBeNull();
  expect(await t.run((ctx) => ctx.db.query("emailHistory").first())).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(ticket))).toMatchObject({
    email: "",
    name: "",
    message: "Contact data deleted",
  });
  expect(
    await t.run((ctx) => ctx.db.query("supportMessages").collect()),
  ).toHaveLength(0);
  expect(await t.run((ctx) => ctx.db.get(claim))).toMatchObject({
    email: "",
    tokenVersion: 2,
  });
  expect((await t.run((ctx) => ctx.db.get(claim)))?.tokenHash).toBeUndefined();
  await t.action(internal.emailDirectory.reconcile, {});
  await t.mutation(internal.emailDirectory.track, {
    key: "late-send",
    email,
    kind: "wall_change",
    subject: "Late",
    state: "accepted",
    providerId: "late-id",
  });
  const contacts = await t.run((ctx) =>
    ctx.db.query("emailContacts").collect(),
  );
  expect(contacts.some((c) => c.email === email)).toBe(false);
  expect(contacts.some((c) => c.email === "other@example.com")).toBe(true);
  const audits = await t.run((ctx) => ctx.db.query("adminAudit").collect());
  expect(JSON.stringify(audits)).not.toContain(email);
});

it("reconciles previously recorded complaints into suppression", async () => {
  const { t } = await setup();
  await t.run((ctx) =>
    ctx.db.insert("emailEvents", {
      eventId: "legacy-complaint",
      providerId: "provider-id",
      type: "email.complained",
      occurredAt: Date.now() - 1000,
    }),
  );
  expect(await t.run((ctx) => emailAllowed(ctx, email, "wall_change"))).toBe(
    true,
  );
  await t.mutation(internal.emailDirectory.reconcileSource, {
    source: "emailHistory",
  });
  expect(await t.run((ctx) => emailAllowed(ctx, email, "wall_change"))).toBe(
    false,
  );
});
