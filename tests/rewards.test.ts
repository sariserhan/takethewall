import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { linkToken, otpCode } from "../lib/claim-secrets";
import { auditHash, sha } from "../lib/audit";
const modules = import.meta.glob("../convex/**/*.ts");
const make = () => convexTest(schema, modules);
type T = ReturnType<typeof make>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  vi.stubEnv(
    "CLAIM_TOKEN_SECRET",
    "test-only-secret-not-for-production-123456789",
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = make();
  const logo = await t.run((ctx) => ctx.storage.store(new Blob(["logo"])));
  await t.mutation(internal.wall.seed, { logoStorageId: logo });
  await t.run((ctx) =>
    ctx.db.insert("rewardSettings", {
      key: "current",
      value: {
        milestones: [
          { takeoverNumber: 1, rewardUsd: 100 },
          { takeoverNumber: 2, rewardUsd: 1000 },
        ],
        initialDays: 7,
        additionalDays: 7,
        rulesVersion: "test-v1",
        rulesJson: '{"version":"test-v1"}',
        rewardsEnabled: true,
        payoutsEnabled: false,
        promotionEnabled: true,
      },
    }),
  );
  return t;
}
async function activate(t: T, n: number) {
  const p = await t.mutation(internal.purchases.pending, {
    requestKey: "req" + n,
    fingerprint: "fp" + n,
    tokenHash: "tok" + n,
    ownerHash: "owner" + n,
    uploadKey: "",
    websiteUrl: "",
    description: "Hello",
    displayName: "Person " + n,
    contentType: "personal",
    buyerEmail: `buyer${n}@example.com`,
    environment: "test",
  });
  const args = {
    takeoverId: p.takeoverId,
    eventId: "evt" + n,
    sessionId: "cs" + n,
    paymentIntentId: "pi" + n,
    amountCents: 399,
    currency: "usd",
    paid: true,
    livemode: false,
  };
  await t.mutation(internal.purchases.activate, args);
  return args;
}
async function firstClaim(t: T) {
  return (await t.run((ctx) => ctx.db.query("rewardClaims").first()))!;
}
async function login(t: T) {
  const c = await firstClaim(t);
  const j = (await t.run((ctx) => ctx.db.query("transactionalMail").first()))!;
  await t.mutation(internal.mail.prepare, { id: j._id });
  const updated = (await t.run((ctx) => ctx.db.get(c._id)))!;
  const token = linkToken(updated.tokenSeed!);
  await t.mutation(internal.claimAuth.start, { token, ipHash: "ip" });
  const otp = (await t.run((ctx) => ctx.db.get(c._id)))!;
  const code = otpCode(otp.otpSeed!);
  return { c, token, code, session: "session-secret" };
}
it("numbers paid activations exactly once and links audit hashes", async () => {
  const t = await setup();
  const args = await activate(t, 1);
  await t.mutation(internal.purchases.activate, args);
  await activate(t, 2);
  const rows = await t.run((ctx) =>
    ctx.db.query("takeoverAudit").withIndex("by_number").collect(),
  );
  expect(rows.map((r) => r.takeoverNumber)).toEqual([1, 2]);
  expect(rows[1].previousAuditHash).toBe(rows[0].auditHash);
  const {
    _id,
    _creationTime,
    takeoverId,
    auditHash: hash,
    ...payload
  } = rows[0];
  void _id;
  void _creationTime;
  void takeoverId;
  expect(auditHash(payload)).toBe(hash);
});
it("creates provisional recipients without publishing a winner snapshot", async () => {
  const t = await setup();
  await activate(t, 1);
  const result = await t.query(api.rewards.overview, {});
  expect(result.milestones[0]).toMatchObject({
    status: "pending_claim",
    snapshot: null,
    candidateNumber: 1,
  });
  expect(result.milestones[1].status).toBe("future");
  expect(result.milestones[0].sequence.at(-1)?.displayName).toBeNull();
  expect(JSON.stringify(result)).not.toContain("buyer1@");
});
it("commits failed OTP attempts and prevents reuse", async () => {
  const t = await setup();
  await activate(t, 1);
  const { token, code, session, c } = await login(t);
  expect(
    await t.mutation(internal.claimAuth.verify, {
      token,
      code,
      session,
      ipHash: "ip",
    }),
  ).toBe(true);
  expect(
    await t.mutation(internal.claimAuth.verify, {
      token,
      code,
      session,
      ipHash: "ip",
    }),
  ).toBe(false);
  expect((await t.query(api.rewards.portal, { session })).claimId).toBe(c._id);
  await expect(
    t.query(api.rewards.portal, { session: "wrong" }),
  ).rejects.toThrow();
});
it("locks the OTP after five failures", async () => {
  const t = await setup();
  await activate(t, 1);
  const { token, code, session } = await login(t);
  const wrong = code === "000000" ? "000001" : "000000";
  for (let n = 0; n < 5; n++)
    expect(
      await t.mutation(internal.claimAuth.verify, {
        token,
        code: wrong,
        session,
        ipHash: "ip",
      }),
    ).toBe(false);
  expect(
    await t.mutation(internal.claimAuth.verify, {
      token,
      code,
      session,
      ipHash: "ip",
    }),
  ).toBe(false);
});
it("expires unanswered claims and resumes at the future successor with overlapping rewards", async () => {
  const t = await setup();
  await activate(t, 1);
  vi.advanceTimersByTime(7 * 86400_000 + 1);
  await t.mutation(internal.rewards.maintain, {});
  expect((await t.query(api.rewards.overview, {})).milestones[0]).toMatchObject(
    { status: "awaiting_successor", candidateNumber: 2 },
  );
  await activate(t, 2);
  const rows = await t.run((ctx) => ctx.db.query("rewardClaims").collect());
  expect(rows.filter((c) => c.takeoverNumber === 2)).toHaveLength(2);
  expect(rows.find((c) => c.takeoverNumber === 1)?.status).toBe("expired");
});
it("does not expire submitted claims during internal review", async () => {
  const t = await setup();
  await activate(t, 1);
  const { token, code, session } = await login(t);
  await t.mutation(internal.claimAuth.verify, {
    token,
    code,
    session,
    ipHash: "ip",
  });
  await t.mutation(api.rewards.submit, {
    session,
    legalName: "Private Name",
    country: "US",
    region: "CA",
    dob: "1990-01-01",
    declaration: "",
    acceptRules: true,
  });
  vi.advanceTimersByTime(8 * 86400_000);
  await t.mutation(internal.rewards.maintain, {});
  expect((await firstClaim(t)).status).toBe("under_review");
  expect(JSON.stringify(await t.query(api.rewards.overview, {}))).not.toContain(
    "Private Name",
  );
});
it("keeps session credentials hashed and expires access after twelve hours", async () => {
  const t = await setup();
  await activate(t, 1);
  const { token, code, session } = await login(t);
  await t.mutation(internal.claimAuth.verify, {
    token,
    code,
    session,
    ipHash: "ip",
  });
  expect(
    (await t.run((ctx) => ctx.db.query("claimSessions").first()))?.hash,
  ).toBe(sha(session));
  vi.advanceTimersByTime(12 * 3600_000 + 1);
  await expect(t.query(api.rewards.portal, { session })).rejects.toThrow();
});
const adminIdentity = {
  subject: "admin-1",
  issuer: "https://auth.test",
  email: "admin@example.com",
  emailVerified: true,
};
it("rejects anonymous, non-admin and unverified admin-email access", async () => {
  const t = await setup();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  await expect(t.query(api.admin.overview, {})).rejects.toThrow(
    "Administrator",
  );
  await expect(
    t
      .withIdentity({ ...adminIdentity, email: "other@example.com" })
      .query(api.admin.overview, {}),
  ).rejects.toThrow();
  await expect(
    t
      .withIdentity({ ...adminIdentity, emailVerified: false })
      .query(api.admin.overview, {}),
  ).rejects.toThrow();
  expect(
    await t.withIdentity(adminIdentity).query(api.admin.identity, {}),
  ).toBe("admin-1");
});
it("requires separate payout send and confirmation and freezes the winning content", async () => {
  const t = await setup();
  await activate(t, 1);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const admin = t.withIdentity(adminIdentity);
  const { c, token, code, session } = await login(t);
  await t.mutation(internal.claimAuth.verify, {
    token,
    code,
    session,
    ipHash: "ip",
  });
  await t.mutation(api.rewards.submit, {
    session,
    legalName: "Private",
    country: "US",
    region: "CA",
    dob: "1990-01-01",
    declaration: "",
    acceptRules: true,
  });
  await admin.mutation(api.admin.claimAction, {
    claimId: c._id,
    action: "approve",
    expectedStatus: "under_review",
    body: "Eligibility reviewed",
    confirmed: true,
  });
  await expect(
    admin.mutation(api.admin.claimAction, {
      claimId: c._id,
      action: "confirm",
      expectedStatus: "approved",
      confirmed: true,
    }),
  ).rejects.toThrow();
  await t.run(async (ctx) => {
    const s = (await ctx.db.query("rewardSettings").first())!;
    await ctx.db.patch(s._id, { value: { ...s.value, payoutsEnabled: true } });
  });
  await admin.mutation(api.admin.claimAction, {
    claimId: c._id,
    action: "sent",
    expectedStatus: "approved",
    reference: "wire-reference",
    confirmed: true,
  });
  expect(
    (await t.query(api.rewards.overview, {})).milestones[0].snapshot,
  ).toBeNull();
  await admin.mutation(api.admin.claimAction, {
    claimId: c._id,
    action: "confirm",
    expectedStatus: "approved",
    confirmed: true,
  });
  let m = (await t.query(api.rewards.overview, {})).milestones[0];
  expect(m).toMatchObject({
    status: "paid",
    snapshot: { displayName: "Person 1", statsFrozen: false },
  });
  await activate(t, 2);
  vi.advanceTimersByTime(120_001);
  await t.mutation(internal.rewards.maintain, {});
  m = (await t.query(api.rewards.overview, {})).milestones[0];
  expect(m.snapshot?.statsFrozen).toBe(true);
  const snapshot = m.snapshot;
  await t.run((ctx) =>
    ctx.db.patch(c.takeoverId, {
      impressions: 999,
      displayName: "Changed record",
    }),
  );
  expect(
    (await t.query(api.rewards.overview, {})).milestones[0].snapshot,
  ).toEqual(snapshot);
});
it("refund before payout cascades and repeated webhook processing is idempotent", async () => {
  const t = await setup();
  const p = await activate(t, 1);
  await activate(t, 2);
  const args = {
    takeoverId: p.takeoverId,
    paymentIntentId: p.paymentIntentId,
    eventId: "refund-1",
    reason: "refunded" as const,
    livemode: false,
  };
  await t.mutation(internal.paymentIssues.record, args);
  await t.mutation(internal.paymentIssues.record, args);
  expect(
    (await t.query(api.rewards.overview, {})).milestones[0].candidateNumber,
  ).toBe(2);
  expect((await firstClaim(t)).status).toBe("ineligible");
});
it("private chat requires the correct claim session and coalesces notifications", async () => {
  const t = await setup();
  await activate(t, 1);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const admin = t.withIdentity(adminIdentity);
  const { c, token, code, session } = await login(t);
  await t.mutation(internal.claimAuth.verify, {
    token,
    code,
    session,
    ipHash: "ip",
  });
  await expect(
    t.mutation(api.rewards.send, { session: "wrong", body: "Hi" }),
  ).rejects.toThrow();
  await t.mutation(api.rewards.send, { session, body: "Question" });
  await admin.mutation(api.admin.message, {
    claimId: c._id,
    body: "Reply one",
  });
  vi.advanceTimersByTime(1000);
  await admin.mutation(api.admin.message, {
    claimId: c._id,
    body: "Reply two",
  });
  const state = await t.query(api.rewards.portal, { session });
  expect(state.messages.filter((m) => m.sender === "admin")).toHaveLength(2);
  await t.mutation(api.rewards.read, { session });
  vi.advanceTimersByTime(600_001);
  await t.mutation(internal.rewards.maintain, {});
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("transactionalMail")
        .withIndex("by_key", (q) => q.eq("key", `chat:${c._id}`))
        .first(),
    ),
  ).toBeNull();
  expect(JSON.stringify(await t.query(api.rewards.overview, {}))).not.toContain(
    "Reply one",
  );
});
it("support stores submissions, limits abuse and queues authenticated replies", async () => {
  const t = await setup();
  const args = {
    name: "Visitor",
    email: "visitor@example.com",
    topic: "Payment issue",
    message: "Please help",
    ipHash: "ip",
    honeypot: "",
  };
  await t.mutation(internal.support.submit, args);
  const ticket = (await t.run((ctx) =>
    ctx.db.query("supportTickets").first(),
  ))!;
  await expect(
    t.mutation(api.admin.supportAction, { id: ticket._id, reply: "Hello" }),
  ).rejects.toThrow();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  await t.withIdentity(adminIdentity).mutation(api.admin.supportAction, {
    id: ticket._id,
    status: "in_progress",
    reply: "We can help",
  });
  expect(
    (await t.run((ctx) => ctx.db.query("supportMessages").first()))?.body,
  ).toBe("We can help");
  for (let n = 0; n < 4; n++) await t.mutation(internal.support.submit, args);
  await expect(t.mutation(internal.support.submit, args)).rejects.toThrow(
    "Too many",
  );
});
it("historical rules and milestone values cannot be changed", async () => {
  const t = await setup();
  await activate(t, 1);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const admin = t.withIdentity(adminIdentity),
    value = await admin.query(api.admin.getSettings, {});
  await expect(
    admin.mutation(api.admin.saveSettings, {
      value: { ...value, milestones: [{ takeoverNumber: 1, rewardUsd: 999 }] },
    }),
  ).rejects.toThrow();
  await expect(
    admin.mutation(api.admin.saveSettings, {
      value: { ...value, rulesJson: '{"changed":true}' },
    }),
  ).rejects.toThrow("immutable");
});

it("detects content tampering and migrates historical paid numbers without counting house reigns", async () => {
  const t = await setup();
  const p = await activate(t, 1);
  expect((await t.query(api.auditTrail.verify, {})).valid).toBe(true);
  await t.run(async (ctx) => {
    const row = (await ctx.db.query("takeoverAudit").first())!;
    await ctx.db.delete(row._id);
    const site = (await ctx.db.query("siteStats").first())!;
    await ctx.db.patch(site._id, { auditHash: undefined });
    await ctx.db.patch(p.takeoverId, {
      takeoverNumber: undefined,
      auditHash: undefined,
      previousAuditHash: undefined,
    });
  });
  expect(await t.mutation(internal.auditTrail.migrate, {})).toEqual({
    done: true,
    paidNumbers: 1,
  });
  expect((await t.query(api.auditTrail.verify, {})).valid).toBe(true);
  await t.run((ctx) => ctx.db.patch(p.takeoverId, { description: "Tampered" }));
  expect((await t.query(api.auditTrail.verify, {})).valid).toBe(false);
});
it("resending immediately revokes old sessions and OTPs before email delivery", async () => {
  const t = await setup();
  await activate(t, 1);
  const { c, token, code, session } = await login(t);
  expect(
    await t.mutation(internal.claimAuth.verify, {
      token,
      code,
      session,
      ipHash: "ip",
    }),
  ).toBe(true);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const updated = (await t.run((ctx) => ctx.db.get(c._id)))!;
  await t.withIdentity(adminIdentity).mutation(api.admin.claimAction, {
    claimId: c._id,
    action: "resend",
    expectedStatus: updated.status,
    confirmed: true,
  });
  expect(await t.mutation(internal.claimAuth.sessionValid, { session })).toBe(
    false,
  );
  await expect(t.query(api.rewards.portal, { session })).rejects.toThrow();
});
it("protects private documents across claims and cleans finalized claims after retention", async () => {
  const t = await setup();
  await activate(t, 1);
  await activate(t, 2);
  const { c, token, code, session } = await login(t);
  await t.mutation(internal.claimAuth.verify, {
    token,
    code,
    session,
    ipHash: "ip",
  });
  const { own, other, storage } = await t.run(async (ctx) => {
    await ctx.db.patch(c._id, { status: "under_review" });
    const second = (await ctx.db.query("rewardClaims").order("desc").first())!;
    const storage = await ctx.storage.store(new Blob(["private"]));
    const own = await ctx.db.insert("claimDocuments", {
      claimId: c._id,
      request: "Identity",
      requestedAt: Date.now(),
      storageId: storage,
    });
    const other = await ctx.db.insert("claimDocuments", {
      claimId: second._id,
      request: "Identity",
      requestedAt: Date.now(),
    });
    return { own, other, storage };
  });
  expect(
    (
      await t.mutation(internal.documents.access, {
        id: own,
        session,
        write: false,
      })
    ).storageId,
  ).toBe(storage);
  await expect(
    t.mutation(internal.documents.access, { id: other, session, write: false }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.documents.manage, {
      id: own,
      confirmed: true,
      reason: "Delete",
    }),
  ).rejects.toThrow();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  await t.withIdentity(adminIdentity).mutation(api.admin.claimAction, {
    claimId: c._id,
    action: "ineligible",
    expectedStatus: "under_review",
    body: "Not eligible",
    confirmed: true,
  });
  expect((await t.run((ctx) => ctx.db.get(own)))!.deleteAt).toBe(
    Date.now() + 90 * 86400_000,
  );
  vi.advanceTimersByTime(90 * 86400_000 + 1);
  await t.mutation(internal.rewards.maintain, {});
  expect((await t.run((ctx) => ctx.db.get(own)))!.deletedAt).toBeTruthy();
  expect(await t.run((ctx) => ctx.storage.get(storage))).toBeNull();
});
it("admin removal preserves paid numbering and safe restoration", async () => {
  const t = await setup();
  const p = await activate(t, 1);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  await t.withIdentity(adminIdentity).mutation(api.admin.moderate, {
    takeoverId: p.takeoverId,
    removeLive: true,
    reason: "Harmful content",
    confirmed: true,
  });
  const site = (await t.run((ctx) => ctx.db.query("siteStats").first()))!;
  expect(site.totalTakeovers).toBe(1);
  expect(site.currentTakeoverId).not.toBe(p.takeoverId);
  expect((await t.query(api.auditTrail.verify, {})).valid).toBe(true);
});
it("configuration publishes authoritative future values and paginates same-time records", async () => {
  const t = await setup();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const admin = t.withIdentity(adminIdentity);
  const value = await admin.query(api.admin.getSettings, {});
  await admin.mutation(api.admin.saveSettings, {
    value: {
      ...value,
      rulesVersion: "test-v2",
      milestones: [
        ...value.milestones,
        { takeoverNumber: 500, rewardUsd: 200 },
      ],
    },
  });
  const rules = JSON.parse((await t.query(api.rewards.rules, {})).json);
  expect(rules.version).toBe("test-v2");
  expect(rules.milestones.at(-1)).toEqual({
    takeoverNumber: 500,
    rewardUsd: 200,
  });
  await t.run(async (ctx) => {
    for (let n = 0; n < 60; n++)
      await ctx.db.insert("adminAudit", {
        actor: "system",
        action: "TEST",
        target: "test",
        metadata: "{}",
        createdAt: Date.now(),
      });
  });
  const first = JSON.parse(
    await admin.query(api.admin.list, { section: "audit" }),
  );
  const next = JSON.parse(
    await admin.query(api.admin.list, { section: "audit", cursor: first.next }),
  );
  expect(first.rows).toHaveLength(50);
  expect(next.rows).toHaveLength(11);
  expect(new Set([...first.rows, ...next.rows].map((r) => r._id)).size).toBe(
    61,
  );
});

it("deduplicates Resend callbacks and preserves out-of-order delivery history", async () => {
  const t = make();
  const event = {
    eventId: "msg-delivered",
    emailId: "email-test",
    type: "email.delivered" as const,
    occurredAt: Date.now(),
  };
  await t.mutation(internal.emailDelivery.record, event);
  await t.mutation(internal.emailDelivery.record, event);
  await t.mutation(internal.emailDelivery.record, {
    ...event,
    eventId: "msg-sent",
    type: "email.sent",
    occurredAt: Date.now() - 1000,
  });
  const rows = await t.run((ctx) => ctx.db.query("adminAudit").take(10));
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.action)).toEqual(["EMAIL_DELIVERED", "EMAIL_SENT"]);
});
