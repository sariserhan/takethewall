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
it.each(["paid", "admin"])(
  "%s issuance requires payout send and confirmation and freezes the winning content",
  async (mode) => {
    const t = await setup();
    if (mode === "paid") await activate(t, 1);
    else {
      vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
      const wall = await t.query(api.wall.current, {});
      await t.withIdentity(adminIdentity).mutation(api.admin.publish, {
        contentType: "personal",
        websiteUrl: "",
        displayName: "Person 1",
        description: "Rehearsal",
        countTowardMilestones: true,
        recipientEmail: "recipient@example.com",
        reason: "Prize rehearsal",
        requestKey: "full-rehearsal",
        expectedCurrentId: wall!.owner.id,
      });
    }
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
      await ctx.db.patch(s._id, {
        value: { ...s.value, payoutsEnabled: true },
      });
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
  },
);
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

it("admin publishing enforces verified access and does not count ordinary placements", async () => {
  const t = await setup();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const current = await t.query(api.wall.current, {});
  const args = {
    contentType: "link" as const,
    websiteUrl: "https://instagram.com/example",
    displayName: "Example",
    description: "Hello",
    countTowardMilestones: false,
    recipientEmail: "",
    reason: "House promotion",
    requestKey: "admin-test-1",
    expectedCurrentId: current!.owner.id,
  };
  for (const client of [
    t,
    t.withIdentity({ ...adminIdentity, email: "other@example.com" }),
    t.withIdentity({ ...adminIdentity, emailVerified: false }),
  ])
    await expect(client.mutation(api.admin.publish, args)).rejects.toThrow(
      "Administrator access required",
    );
  const admin = t.withIdentity(adminIdentity);
  const id = await admin.mutation(api.admin.publish, args);
  expect(await admin.mutation(api.admin.publish, args)).toBe(id);
  const wall = await t.query(api.wall.current, {});
  expect(wall).toMatchObject({
    totalTakeovers: 0,
    owner: {
      id,
      kind: "admin_placement",
      linkType: "instagram",
      takeoverNumber: null,
    },
  });
  expect(
    await t.run((ctx) => ctx.db.query("takeoverAudit").collect()),
  ).toHaveLength(0);
  expect(
    await t.run((ctx) => ctx.db.query("rewardClaims").collect()),
  ).toHaveLength(0);
  await expect(
    admin.mutation(api.admin.publish, { ...args, requestKey: "stale" }),
  ).rejects.toThrow("The wall changed");
  await expect(
    admin.mutation(api.admin.publish, { ...args, description: "Changed" }),
  ).rejects.toThrow("different content");
});

it("counted admin issuance opens a claim and joins paid hashes without inventing revenue or Stripe payments", async () => {
  const t = await setup();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const admin = t.withIdentity(adminIdentity);
  const initial = await t.query(api.wall.current, {});
  const args = {
    contentType: "personal" as const,
    websiteUrl: "",
    displayName: "Sponsored recipient",
    description: "Hello",
    countTowardMilestones: true,
    recipientEmail: "recipient@example.com",
    reason: "Sponsored entry",
    requestKey: "counted-test",
    expectedCurrentId: initial!.owner.id,
  };
  await expect(
    admin.mutation(api.admin.publish, { ...args, recipientEmail: "" }),
  ).rejects.toThrow();
  const id = await admin.mutation(api.admin.publish, args);
  await admin.mutation(api.admin.publish, args);
  expect(await firstClaim(t)).toMatchObject({
    takeoverId: id,
    takeoverNumber: 1,
    email: "recipient@example.com",
    status: "pending_claim",
  });
  expect(await t.query(api.wall.current, {})).toMatchObject({
    totalTakeovers: 1,
    owner: { kind: "admin_counted", takeoverNumber: 1 },
  });
  const issuance = await t.run((ctx) =>
    ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", id))
      .unique(),
  );
  expect(issuance).toMatchObject({ amountCents: 0, issuedByAdmin: "admin-1" });
  expect(issuance?.paidAt).toBeUndefined();
  expect(issuance?.sessionId).toBeUndefined();
  expect(issuance?.paymentIntentId).toBeUndefined();
  expect(
    await t.run((ctx) => ctx.db.query("paymentEvents").collect()),
  ).toHaveLength(0);
  await activate(t, 7);
  const history = await t.query(api.auditTrail.entries, {});
  expect(history.entries.map((x) => x.amountCents)).toEqual([0, 399]);
  expect(history.entries[1].previousAuditHash).toBe(
    history.entries[0].auditHash,
  );
  expect(await t.query(api.auditTrail.verify, {})).toMatchObject({
    valid: true,
  });
  const day = await t.run((ctx) => ctx.db.query("dailyStats").first());
  expect(day).toMatchObject({ takeovers: 2, revenueCents: 399 });
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("takeovers")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect(),
    ),
  ).toHaveLength(1);
  const audits = await t.run((ctx) => ctx.db.query("adminAudit").collect());
  expect(audits.filter((x) => x.action === "ADMIN_PUBLISH")).toHaveLength(1);
});

it("admin can initialize an empty wall and unsafe destinations are rejected", async () => {
  const t = make();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const admin = t.withIdentity(adminIdentity);
  const args = {
    contentType: "link" as const,
    websiteUrl: "javascript:alert(1)",
    displayName: "Example",
    description: "",
    countTowardMilestones: false,
    recipientEmail: "",
    reason: "Launch",
    requestKey: "initial",
    expectedCurrentId: null,
  };
  await expect(admin.mutation(api.admin.publish, args)).rejects.toThrow();
  await admin.mutation(api.admin.publish, {
    ...args,
    websiteUrl: "https://example.com",
  });
  expect(await t.query(api.wall.current, {})).toMatchObject({
    totalTakeovers: 0,
    owner: { domain: "example.com" },
  });
});

it("rehearsal preparation rejects production and preserves existing settings", async () => {
  const t = make();
  vi.stubEnv("CONVEX_CLOUD_URL", "https://canny-bee-832.convex.cloud");
  await expect(t.mutation(internal.rehearsal.prepare, {})).rejects.toThrow(
    "only available",
  );
  vi.stubEnv("CONVEX_CLOUD_URL", "https://aromatic-falcon-454.convex.cloud");
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  await expect(t.mutation(internal.rehearsal.prepare, {})).rejects.toThrow(
    "only available",
  );
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  expect(await t.mutation(internal.rehearsal.prepare, {})).toEqual({
    ready: true,
    milestones: [1, 2, 3],
  });
  await t.mutation(internal.rehearsal.prepare, {});
  expect(
    await t.run((ctx) => ctx.db.query("rewardSettings").collect()),
  ).toHaveLength(1);
  const existing = await setup();
  await expect(
    existing.mutation(internal.rehearsal.prepare, {}),
  ).rejects.toThrow("already has");
});

it("public previous owner follows only the last activation and hides removed content", async () => {
  const t = await setup();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const admin = t.withIdentity(adminIdentity);
  let wall = await t.query(api.wall.current, {});
  expect(wall?.previousOwnerName).toBeNull();
  const args = { contentType: "personal" as const, websiteUrl: "", displayName: "Previous owner", description: "Hello", countTowardMilestones: false, recipientEmail: "", reason: "Test", requestKey: "previous-1", expectedCurrentId: wall!.owner.id };
  const first = await admin.mutation(api.admin.publish, args);
  await admin.mutation(api.admin.publish, { ...args, displayName: "Current owner", requestKey: "previous-2", expectedCurrentId: first });
  wall = await t.query(api.wall.current, {});
  expect(wall?.previousOwnerName).toBe("Previous owner");
  await t.run(ctx => ctx.db.patch(first, { blocked: true }));
  expect((await t.query(api.wall.current, {}))?.previousOwnerName).toBe("Removed placement");
});

it("health diagnostics require admin access and expose configuration presence, never secrets", async () => {
  const t = await setup();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("RESEND_API_KEY", "private-resend-test-value");
  await expect(t.query(api.health.overview, {})).rejects.toThrow("Administrator access required");
  const result = await t.withIdentity(adminIdentity).query(api.health.overview, {});
  expect(result).not.toContain("private-resend-test-value");
  expect(JSON.parse(result)).toMatchObject({wallInitialized: true, lastPaymentAt: null, failedMail: 0, failedJobs: 0});
});

it("demo stats are admin-only, separate from real counters, and expire on owner change", async () => {
  const t = await setup();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const admin = t.withIdentity(adminIdentity);
  const before = (await t.query(api.wall.current, {}))!;
  const values = {visitorsToday:12,totalVisitors:100,impressions:50,uniqueVisitors:25,clicks:5,previousOwnerName:"Sample previous owner"};
  const args = {enabled:true,values,reason:"Labeled launch demo",expectedCurrentId:before.owner.id};
  await expect(t.mutation(api.demoStats.save,args)).rejects.toThrow("Administrator access required");
  await expect(t.query(api.demoStats.read,{})).rejects.toThrow("Administrator access required");
  await expect(admin.mutation(api.demoStats.save,{...args,values:{...values,clicks:51}})).rejects.toThrow("consistent");
  await expect(admin.mutation(api.demoStats.save,{...args,values:{...values,previousOwnerName:"x".repeat(61)}})).rejects.toThrow("Previous owner");
  await admin.mutation(api.demoStats.save,args);
  expect(await admin.query(api.demoStats.read,{})).toMatchObject({values});
  expect(await t.query(api.wall.current,{})).toEqual({...before,demoStats:values});
  await admin.mutation(api.demoStats.save,{...args,enabled:false});
  expect((await t.query(api.wall.current,{}))?.demoStats).toBeNull();
  await admin.mutation(api.demoStats.save,args);
  await admin.mutation(api.admin.publish,{contentType:"personal",websiteUrl:"",displayName:"Next real owner",description:"Hello",countTowardMilestones:false,recipientEmail:"",reason:"Replacement",requestKey:"demo-replacement",expectedCurrentId:before.owner.id});
  const after = (await t.query(api.wall.current,{}))!;
  expect(after.demoStats).toBeNull();
  expect(after.totalVisitors).toBe(before.totalVisitors);
  expect(after.totalTakeovers).toBe(before.totalTakeovers);
  expect(after.owner.impressions).toBe(0);
  await expect(admin.mutation(api.demoStats.save,args)).rejects.toThrow("wall changed");
  const events=await t.run(ctx=>ctx.db.query("adminAudit").collect());
  expect(events.filter(e=>e.action==="DEMO_STATS_UPDATED")).toHaveLength(3);
});

it("demo presentation never rewrites ownership, audit history or real prize progress", async () => {
  const t = await setup();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const admin = t.withIdentity(adminIdentity);
  const before = (await t.query(api.wall.current, {}))!;
  const rewards = await t.query(api.rewards.overview, {});
  const presentation = {displayName:"Sample person",description:"Demo message",websiteUrl:"https://example.com/",ownerSince:Date.now()-100000,previousOwnerName:"Sample previous",takeoverCount:99};
  const args = {enabled:true,values:{visitorsToday:0,totalVisitors:0,impressions:0,uniqueVisitors:0,clicks:0},presentation,reason:"Preview only",expectedCurrentId:before.owner.id};
  await admin.mutation(api.demoStats.save,args);
  const after = (await t.query(api.wall.current,{}))!;
  expect(after.demoPresentation).toEqual(presentation);
  expect(after.owner).toEqual(before.owner);
  expect(after.totalTakeovers).toBe(before.totalTakeovers);
  expect(after.previousOwnerName).toBe(before.previousOwnerName);
  expect(await t.query(api.rewards.overview,{})).toEqual(rewards);
  await expect(admin.mutation(api.demoStats.save,{...args,presentation:{...presentation,websiteUrl:"javascript:alert(1)"}})).rejects.toThrow();
  await expect(admin.mutation(api.demoStats.save,{...args,presentation:{...presentation,ownerSince:Date.now()+1}})).rejects.toThrow();
  const {presentation: ignored, ...withoutPresentation} = args;
  void ignored;
  await admin.mutation(api.demoStats.save,withoutPresentation);
  expect((await t.query(api.wall.current,{}))?.demoPresentation).toBeNull();
});
