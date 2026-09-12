import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { ownerToken, ownerUnsubscribeToken } from "../lib/owner-secrets";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T09:00:00Z"));
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  vi.stubEnv("CLAIM_TOKEN_SECRET", "owner-test-secret-at-least-32-characters");
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function setup() {
  const t = convexTest(schema, modules);
  const logo = await t.run((ctx) => ctx.storage.store(new Blob(["logo"])));
  await t.mutation(internal.wall.seed, { logoStorageId: logo });
  const admin = t.withIdentity({
    subject: "admin",
    email: "admin@example.com",
    emailVerified: true,
  });
  const publish = async (name: string) => {
    const site = (await t.query(api.wall.current, {}))!;
    return admin.mutation(api.admin.publish, {
      contentType: "personal",
      websiteUrl: "",
      displayName: name,
      description: "A real placement",
      countTowardMilestones: true,
      recipientEmail: `${name}@example.com`,
      reason: "Owner feature test",
      requestKey: `owner-${name}`,
      expectedCurrentId: site.owner.id,
    });
  };
  const id = await publish("first");
  await t.mutation(internal.owners.ensureAccess, { takeoverId: id });
  const access = (await t.run((ctx) =>
    ctx.db
      .query("ownerAccess")
      .withIndex("by_takeover", (q) => q.eq("takeoverId", id))
      .unique(),
  ))!;
  return { t, id, admin, publish, access, token: ownerToken(access.seed) };
}
it("private access is scoped to one takeover and excludes demo additions and contact data", async () => {
  const { t, id, token, publish } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { impressions: 7, uniqueVisitors: 2, clicks: 1 });
    await ctx.db.insert("demoStats", {
      key: "current",
      enabled: true,
      takeoverId: id,
      values: {
        visitorsToday: 10,
        totalVisitors: 10,
        impressions: 100,
        uniqueVisitors: 50,
        clicks: 20,
      },
      updatedAt: Date.now(),
    });
  });
  const owner = await t.query(internal.owners.dashboard, { token });
  expect(owner.owner).toMatchObject({
    id,
    impressions: 7,
    uniqueVisitors: 2,
    clicks: 1,
  });
  expect(owner.active).toBe(true);
  expect(JSON.stringify(owner)).not.toContain("first@example.com");
  expect(owner.shareUrl).not.toContain(token);
  await expect(
    t.query(internal.owners.dashboard, { token: "a".repeat(64) }),
  ).rejects.toThrow("Invalid private link");
  await publish("second");
  const ended = await t.query(internal.owners.dashboard, { token });
  expect(ended.owner.id).toBe(id);
  expect(ended.active).toBe(false);
  expect(ended.replacedAt).not.toBeNull();
});
it("share pages expose only published placements and respect moderation", async () => {
  const { t, id, token } = await setup();
  const owner = await t.query(internal.owners.dashboard, { token });
  expect(
    await t.query(internal.owners.sharedTakeover, { publicId: owner.publicId }),
  ).toMatchObject({ owner: { id }, active: true });
  expect(
    await t.query(internal.owners.sharedTakeover, { publicId: token }),
  ).toBeNull();
  await t.run((ctx) => ctx.db.patch(id, { blocked: true }));
  expect(
    await t.query(internal.owners.sharedTakeover, { publicId: owner.publicId }),
  ).toBeNull();
});
it("unsubscribe tokens cannot open a dashboard and private tokens cannot unsubscribe through the email endpoint", async () => {
  const { t, access, token } = await setup();
  const unsubscribe = ownerUnsubscribeToken(access.seed);
  await expect(
    t.query(internal.owners.dashboard, { token: unsubscribe }),
  ).rejects.toThrow("Invalid private link");
  expect(await t.mutation(internal.owners.unsubscribe, { token })).toBe(false);
  expect(
    await t.mutation(internal.owners.unsubscribe, { token: unsubscribe }),
  ).toBe(true);
  expect(
    (await t.query(internal.owners.dashboard, { token })).weeklyDigestEnabled,
  ).toBe(false);
  await t.mutation(internal.owners.preferences, {
    token,
    weeklyDigestEnabled: true,
  });
  expect(
    (await t.query(internal.owners.dashboard, { token })).weeklyDigestEnabled,
  ).toBe(true);
});
it("recovery sends only to the matching purchaser and accepts public numbering offsets", async () => {
  const { t, id } = await setup();
  await t.mutation(internal.numbering.initialize, { expectedRecordedCount: 1 });
  await t.mutation(internal.owners.requestLink, {
    number: 16,
    email: "wrong@example.com",
    ipHash: "ip-a",
  });
  const before = await t.run((ctx) => ctx.db.query("jobs").collect());
  expect(before.filter((j) => j.kind === "owner_access_email")).toHaveLength(0);
  await t.mutation(internal.owners.requestLink, {
    number: 16,
    email: "first@example.com",
    ipHash: "ip-b",
  });
  const rows = await t.run((ctx) => ctx.db.query("jobs").collect());
  expect(rows.filter((j) => j.kind === "owner_access_email")).toHaveLength(1);
  expect(rows.find((j) => j.kind === "owner_access_email")?.takeoverId).toBe(
    id,
  );
});
it("owner links can be reconstructed after secret rotation without retaining valid old tokens", async () => {
  const { t, id, token, access } = await setup();
  vi.stubEnv(
    "CLAIM_TOKEN_SECRET",
    "rotated-owner-secret-at-least-32-characters",
  );
  await t.mutation(internal.owners.ensureAccess, { takeoverId: id });
  await expect(t.query(internal.owners.dashboard, { token })).rejects.toThrow(
    "Invalid private link",
  );
  expect(
    await t.query(internal.owners.dashboard, {
      token: ownerToken(access.seed),
    }),
  ).toMatchObject({ owner: { id } });
});
async function production() {
  const result = await setup();
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  await result.t.run(async (ctx) => {
    const p = (await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", result.id))
      .unique())!;
    await ctx.db.patch(p._id, { environment: "production" });
    const jobs = await ctx.db.query("jobs").collect();
    for (const j of jobs) await ctx.db.patch(j._id, { state: "sent" });
  });
  return result;
}
it("weekly digests are deduplicated, use recorded totals, and have stable retry snapshots", async () => {
  const { t, id } = await production();
  await t.run((ctx) =>
    ctx.db.patch(id, { impressions: 12, uniqueVisitors: 4, clicks: 2 }),
  );
  expect(await t.mutation(internal.owners.queueWeeklyDigest, {})).toBe(true);
  expect(await t.mutation(internal.owners.queueWeeklyDigest, {})).toBe(false);
  const job = (await t.run((ctx) =>
    ctx.db
      .query("jobs")
      .withIndex("by_key", (q) =>
        q.eq("key", `weekly_digest_email:${id}:2026-09-14`),
      )
      .unique(),
  ))!;
  expect(job.digest).toMatchObject({
    impressions: 12,
    uniqueVisitors: 4,
    clicks: 2,
  });
  await t.run((ctx) => ctx.db.patch(id, { impressions: 99 }));
  expect(
    (await t.query(internal.jobs.data, { id: job._id }))?.digest?.impressions,
  ).toBe(12);
  vi.stubEnv("RESEND_API_KEY", "fake-key");
  vi.stubEnv("RESEND_FROM", "notification@takethewall.com");
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await t.action(internal.jobs.dispatch, {});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const request = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(request.to).toEqual(["first@example.com"]);
  expect(request.html).toContain("YOUR WEEKLY OWNER REPORT");
  expect(request.html).toContain("Open your private dashboard");
  expect(request.text).toContain("Totals since");
  expect(request.headers["List-Unsubscribe-Post"]).toBe(
    "List-Unsubscribe=One-Click",
  );
  await t.action(internal.jobs.dispatch, {});
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it.each(["replaced", "unsubscribed"] as const)(
  "queued weekly mail is suppressed when owner is %s",
  async (reason) => {
    const { t, id, token } = await production();
    await t.mutation(internal.owners.queueWeeklyDigest, {});
    if (reason === "unsubscribed")
      await t.mutation(internal.owners.preferences, {
        token,
        weeklyDigestEnabled: false,
      });
    else
      await t.run((ctx) =>
        ctx.db.patch(id, { status: "replaced", replacedAt: Date.now() }),
      );
    vi.stubEnv("RESEND_API_KEY", "fake");
    vi.stubEnv("RESEND_FROM", "notification@takethewall.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.jobs.dispatch, {});
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
it("test deployments and opted-out owners do not queue weekly email", async () => {
  const { t, token } = await setup();
  expect(await t.mutation(internal.owners.queueWeeklyDigest, {})).toBe(false);
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  await t.mutation(internal.owners.preferences, {
    token,
    weeklyDigestEnabled: false,
  });
  expect(await t.mutation(internal.owners.queueWeeklyDigest, {})).toBe(false);
});
it("reports remain attached to the reported owner and anonymous reports cannot trigger replies", async () => {
  const { t, id, publish, admin } = await setup();
  await publish("second");
  await t.mutation(internal.support.reportContent, {
    takeoverId: id,
    reason: "Scam or phishing",
    details: "The destination asks for bank passwords.",
    email: "",
    ipHash: "report-ip",
    honeypot: "",
  });
  const report = (await t.run((ctx) =>
    ctx.db.query("supportTickets").first(),
  ))!;
  expect(report).toMatchObject({
    takeoverId: id,
    status: "open",
    topic: "Report content",
    email: "",
  });
  expect(report.reportedContent).toContain("first");
  await expect(t.query(api.admin.ticket, { id: report._id })).rejects.toThrow(
    "Administrator access",
  );
  await expect(
    admin.mutation(api.admin.supportAction, {
      id: report._id,
      reply: "Thanks",
    }),
  ).rejects.toThrow("no reply email");
  await t.mutation(internal.support.reportContent, {
    takeoverId: id,
    reason: "Other",
    details: "Spam test honeypot is filled",
    email: "",
    ipHash: "bot",
    honeypot: "bot",
  });
  expect(
    await t.run((ctx) => ctx.db.query("supportTickets").collect()),
  ).toHaveLength(1);
});

const edits = {
  expectedRevision: 0,
  contentType: "personal" as const,
  websiteUrl: "",
  displayName: "Corrected name",
  description: "Typo fixed",
  uploadKey: "",
  ownerHash: "edit-ip",
  removeImage: false,
};
it("owner edits preserve sealed history, numbering, stats and permanent snapshots", async () => {
  const { t, id, token } = await setup();
  await t.run((ctx) =>
    ctx.db.patch(id, { impressions: 25, uniqueVisitors: 8, clicks: 3 }),
  );
  const before = await t.query(api.wall.current, {});
  const sealed = await t.run((ctx) => ctx.db.query("takeoverAudit").collect());
  const snapshot = {
    displayName: "first",
    contentType: "personal",
    linkType: "other",
    websiteUrl: "",
    description: "A real placement",
    activatedAt: Date.now(),
    impressions: 25,
    uniqueVisitors: 8,
    clicks: 3,
    statsFrozen: false,
  };
  const rewardId = await t.run((ctx) =>
    ctx.db.insert("milestoneRewards", {
      milestoneNumber: 100,
      rewardUsd: 100,
      originalCandidateNumber: 1,
      candidateNumber: 1,
      status: "paid",
      rulesVersion: "test",
      rulesHash: "hash",
      initialDays: 7,
      additionalDays: 7,
      outboundLinkEnabled: false,
      winnerTakeoverId: id,
      snapshot,
    }),
  );
  await t.mutation(internal.owners.edit, { token, ...edits });
  const after = await t.query(api.wall.current, {});
  expect(after).toMatchObject({
    totalTakeovers: before!.totalTakeovers,
    owner: {
      id,
      takeoverNumber: before!.owner.takeoverNumber,
      activatedAt: before!.owner.activatedAt,
      activationSequence: before!.owner.activationSequence,
      impressions: 25,
      uniqueVisitors: 8,
      clicks: 3,
      displayName: "Corrected name",
    },
  });
  expect(await t.run((ctx) => ctx.db.query("takeoverAudit").collect())).toEqual(
    sealed,
  );
  expect(await t.query(api.auditTrail.verify, {})).toMatchObject({
    valid: true,
  });
  expect((await t.run((ctx) => ctx.db.get(rewardId)))!.snapshot).toEqual(
    snapshot,
  );
  expect(
    (await t.run((ctx) => ctx.db.get(id)))!.originalContent?.displayName,
  ).toBe("first");
  await expect(
    t.mutation(internal.owners.edit, { token, ...edits }),
  ).rejects.toThrow("another tab");
  await t.mutation(internal.owners.edit, {
    token,
    ...edits,
    expectedRevision: 1,
    description: "Another correction",
  });
  expect(
    (await t.run((ctx) => ctx.db.get(id)))!.originalContent?.displayName,
  ).toBe("first");
  const log = await t.run((ctx) => ctx.db.query("adminAudit").collect());
  expect(log.filter((a) => a.action === "OWNER_CONTENT_EDITED")).toHaveLength(
    2,
  );
});
it("invalid, replaced and blocked owners cannot edit or bypass moderation", async () => {
  const { t, id, token, publish } = await setup();
  await expect(
    t.mutation(internal.owners.edit, { ...edits, token: "a".repeat(64) }),
  ).rejects.toThrow("Invalid private link");
  await expect(
    t.mutation(internal.owners.edit, {
      ...edits,
      token,
      displayName: "<script>",
    }),
  ).rejects.toThrow("plain text");
  await expect(
    t.mutation(internal.owners.edit, {
      ...edits,
      token,
      contentType: "link",
      websiteUrl: "http://localhost",
    }),
  ).rejects.toThrow();
  await t.run((ctx) => ctx.db.patch(id, { outboundLinkEnabled: false }));
  await t.mutation(internal.owners.edit, {
    ...edits,
    token,
    contentType: "link",
    websiteUrl: "https://example.com",
  });
  expect((await t.run((ctx) => ctx.db.get(id)))!.outboundLinkEnabled).toBe(
    false,
  );
  await t.run((ctx) => ctx.db.patch(id, { blocked: true }));
  await expect(
    t.mutation(internal.owners.edit, { ...edits, token, expectedRevision: 1 }),
  ).rejects.toThrow("current owner");
  await t.run((ctx) => ctx.db.patch(id, { blocked: false }));
  const newer = await publish("newer");
  await expect(
    t.mutation(internal.owners.edit, { ...edits, token, expectedRevision: 1 }),
  ).rejects.toThrow("current owner");
  expect((await t.run((ctx) => ctx.db.get(newer)))!.displayName).toBe("newer");
});
it("image edits claim only a fresh upload belonging to this request and preserve originals", async () => {
  const { t, id, token } = await setup();
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["new image"])),
  );
  await t.mutation(internal.uploads.reserve, {
    key: "edit-upload",
    ownerHash: "edit-ip",
  });
  await t.mutation(internal.uploads.finish, { key: "edit-upload", storageId });
  await expect(
    t.mutation(internal.owners.edit, {
      ...edits,
      token,
      uploadKey: "edit-upload",
      ownerHash: "wrong-ip",
    }),
  ).rejects.toThrow("upload expired");
  await t.mutation(internal.owners.edit, {
    ...edits,
    token,
    uploadKey: "edit-upload",
  });
  expect((await t.run((ctx) => ctx.db.get(id)))!.logoStorageId).toBe(storageId);
  await expect(
    t.mutation(internal.owners.edit, {
      ...edits,
      token,
      expectedRevision: 1,
      uploadKey: "edit-upload",
    }),
  ).rejects.toThrow("upload expired");
  await t.mutation(internal.owners.edit, {
    ...edits,
    token,
    expectedRevision: 1,
    removeImage: true,
  });
  expect((await t.run((ctx) => ctx.db.get(id)))!.logoStorageId).toBeUndefined();
});
it("admin notifications capture activation once and dispatch privately without owner access tokens", async () => {
  const { t, publish } = await setup();
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  const id = await publish("production");
  const job = (await t.run((ctx) =>
    ctx.db
      .query("jobs")
      .withIndex("by_key", (q) => q.eq("key", `admin_takeover_email:${id}:`))
      .unique(),
  ))!;
  expect(job.adminNotice?.body).toContain("production@example.com");
  expect(job.adminNotice?.body).toContain("Amount: 0.00 USD");
  await publish("production"); // Same request key, idempotent activation.
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { displayName: "Changed later" });
    for (const j of await ctx.db.query("jobs").collect())
      if (j._id !== job._id) await ctx.db.patch(j._id, { state: "sent" });
  });
  vi.stubEnv("RESEND_API_KEY", "fake");
  vi.stubEnv("RESEND_FROM", "notification@takethewall.com");
  const send = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", send);
  await t.action(internal.jobs.dispatch, {});
  expect(send).toHaveBeenCalledTimes(1);
  const message = JSON.parse(send.mock.calls[0][1].body);
  expect(message.to).toEqual(["serhan.sari@yahoo.com"]);
  expect(message.from).toBe("notification@takethewall.com");
  expect(message.text).toContain("production@example.com");
  expect(message.text).not.toContain("Changed later");
  expect(message.html).toContain("WALL TAKEOVER NOTIFICATION");
  expect(message.html).toContain("Open admin dashboard");
  expect(message.text).not.toContain("#token=");
  await t.action(internal.jobs.dispatch, {});
  expect(send).toHaveBeenCalledTimes(1);
});

it("cleanup retains original winning images after an owner replaces them", async () => {
  const { t, id, token } = await setup();
  const original = await t.run((ctx) =>
    ctx.storage.store(new Blob(["original"])),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { logoStorageId: original });
    await ctx.db.insert("uploads", {
      key: "old-image",
      ownerHash: "edit-ip",
      claimed: true,
      storageId: original,
      expiresAt: Date.now() - 1,
    });
  });
  await t.mutation(internal.owners.edit, {
    ...edits,
    token,
    removeImage: true,
  });
  await t.mutation(internal.operations.cleanup, {});
  expect(
    await t.run(async (ctx) => Boolean(await ctx.storage.get(original))),
  ).toBe(true);
});
