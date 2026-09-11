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
