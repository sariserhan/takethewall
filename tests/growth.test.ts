import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { ensureOwnerAccess } from "../convex/ownerModel";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  vi.stubEnv("PUBLIC_METRICS_ENABLED", "true");
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules);
  const logo = await t.run((ctx) => ctx.storage.store(new Blob(["image"])));
  await t.mutation(internal.wall.seed, { logoStorageId: logo });
  let serial = 0;
  const create = async (
    email = "owner@example.com",
    referralPublicId?: string,
  ) => {
    const key = "growth-" + ++serial;
    return t.mutation(internal.purchases.pending, {
      requestKey: key,
      fingerprint: key,
      tokenHash: key,
      ownerHash: key,
      uploadKey: "",
      contentType: "personal",
      displayName: "Raven Studio",
      websiteUrl: "",
      description:
        "Independent creative studio building thoughtful things for the web.",
      buyerEmail: email,
      environment: process.env.WALL_ENVIRONMENT as "production" | "test",
      ...(referralPublicId ? { referralPublicId } : {}),
    });
  };
  const pay = (id: Id<"takeovers">, eventId = String(id)) =>
    t.mutation(internal.purchases.activate, {
      takeoverId: id,
      eventId,
      sessionId: "cs_" + id,
      paymentIntentId: "pi_" + id,
      amountCents: 499,
      currency: "usd",
      paid: true,
      livemode: process.env.WALL_ENVIRONMENT === "production",
    });
  const source = await create();
  await pay(source.takeoverId);
  const sourceRow = (await t.run((ctx) => ctx.db.get(source.takeoverId)))!;
  const publicId = sourceRow.publicTakeoverId!;
  const admin = t.withIdentity({
    subject: "admin",
    email: "admin@example.com",
    emailVerified: true,
  });
  return { t, admin, source, publicId, create, pay };
}
it("deduplicates referred browsers, ignores test traffic, and refuses blocked pages", async () => {
  const { t, source, publicId } = await setup();
  const visit = { publicId, visitorHash: "a".repeat(64) };
  expect(await t.mutation(internal.growth.visit, visit)).toBe(true);
  await t.mutation(internal.growth.visit, visit);
  expect(
    (await t.run((ctx) => ctx.db.get(source.takeoverId)))?.shareVisitors,
  ).toBe(1);
  expect((await t.query(api.wall.current, {}))?.owner.shareVisitors).toBe(1);
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  expect(
    await t.mutation(internal.growth.visit, {
      ...visit,
      visitorHash: "b".repeat(64),
    }),
  ).toBe(false);
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  await t.run((ctx) => ctx.db.patch(source.takeoverId, { blocked: true }));
  expect(await t.mutation(internal.growth.visit, visit)).toBe(false);
});
it("credits one actual payment despite webhook retries and excludes self-referrals and test payments", async () => {
  const { t, source, publicId, create, pay } = await setup();
  const p = await create("friend@example.com", publicId);
  await pay(p.takeoverId);
  await pay(p.takeoverId);
  await pay(p.takeoverId, "different-event");
  expect(
    (await t.run((ctx) => ctx.db.get(source.takeoverId)))?.shareTakeovers,
  ).toBe(1);
  const self = await create("OWNER@example.com", publicId);
  await pay(self.takeoverId);
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  const test = await create("test@example.com", publicId);
  await pay(test.takeoverId);
  expect(
    (await t.run((ctx) => ctx.db.get(source.takeoverId)))?.shareTakeovers,
  ).toBe(1);
});
it("retains first checkout attribution on retries and returns the purchased public ID after replacement", async () => {
  const { t, publicId, create, pay } = await setup();
  const p = await create("friend@example.com", publicId);
  await pay(p.takeoverId);
  const confirmation = await t.mutation(internal.purchases.confirmation, {
    tokenHash: "growth-1",
  });
  expect(confirmation).toMatchObject({ state: "replaced", publicId });
  const retry = await t.mutation(internal.purchases.pending, {
    requestKey: "growth-3",
    fingerprint: "same",
    tokenHash: "retry",
    ownerHash: "retry",
    uploadKey: "",
    contentType: "personal",
    displayName: "Another owner",
    websiteUrl: "",
    description: "Hello world",
    buyerEmail: "next@example.com",
    environment: "production",
    referralPublicId: publicId,
  });
  await t.mutation(internal.purchases.pending, {
    requestKey: "growth-3",
    fingerprint: "same",
    tokenHash: "retry",
    ownerHash: "retry",
    uploadKey: "",
    contentType: "personal",
    displayName: "Another owner",
    websiteUrl: "",
    description: "Hello world",
    buyerEmail: "next@example.com",
    environment: "production",
  });
  expect(
    (await t.run((ctx) => ctx.db.get(retry.purchaseId)))?.referralSource,
  ).toBeDefined();
});
it("requires admin review, rejects thin or stale reviews, and removes edited or blocked content from search", async () => {
  const { t, admin, source, publicId } = await setup();
  const args = {
    publicId,
    summary:
      "An original overview explaining this independent studio, the work it publishes, and why its project is part of Take The Wall history. Readers can explore the project from the owner’s public link.",
    approved: true,
    expectedRevision: 0,
  };
  await expect(t.mutation(api.growth.review, args)).rejects.toThrow(
    "Administrator",
  );
  await expect(
    admin.mutation(api.growth.review, { ...args, summary: "Too short" }),
  ).rejects.toThrow("overview");
  await admin.mutation(api.growth.review, args);
  expect(await t.query(internal.growth.sitemap, { page: 0 })).toHaveLength(1);
  expect(
    await t.query(internal.owners.sharedTakeover, { publicId }),
  ).toMatchObject({ searchIndexable: true, editorial: args.summary });
  await t.run((ctx) => ctx.db.patch(source.takeoverId, { contentRevision: 1 }));
  expect(await t.query(internal.growth.sitemap, { page: 0 })).toHaveLength(0);
  await expect(admin.mutation(api.growth.review, args)).rejects.toThrow(
    "Content changed",
  );
  await admin.mutation(api.growth.review, { ...args, expectedRevision: 1 });
  await t.run((ctx) => ctx.db.patch(source.takeoverId, { blocked: true }));
  expect(await t.query(internal.growth.sitemap, { page: 0 })).toHaveLength(0);
  expect(
    await t.query(internal.owners.sharedTakeover, { publicId }),
  ).toBeNull();
});
it("history pagination uses recorded sequences and never returns buyer emails or blocked content", async () => {
  const { t, source, publicId } = await setup();
  await t.run(async (ctx) => {
    const base = (await ctx.db.get(source.takeoverId))!;
    const { _id, _creationTime, ...fields } = base;
    void _id;
    void _creationTime;
    for (let i = 2; i <= 27; i++)
      await ctx.db.insert("takeovers", {
        ...fields,
        publicTakeoverId: "ttw_" + i.toString(16).padStart(32, "0"),
        activationSequence: i,
        status: "replaced",
        blocked: i === 26,
        replacedAt: Date.now() + 1000,
      });
  });
  const first = await t.query(internal.growth.history, {});
  expect(first!.entries).toHaveLength(23);
  expect(first!.next).toBe(4);
  const second = await t.query(internal.growth.history, {
    before: first!.next!,
  });
  expect(second!.entries).toHaveLength(3);
  expect(second!.entries.at(-1)?.publicId).toBe(publicId);
  expect(JSON.stringify(first)).not.toMatch(
    /buyerEmail|owner@example.com|tokenHash/,
  );
  expect(
    new Set([...first!.entries, ...second!.entries].map((e) => e.publicId))
      .size,
  ).toBe(26);
});

it("refuses non-admin access to the social kit", async () => {
  const { t, publicId } = await setup();
  await expect(t.query(api.growth.kit, { publicId })).rejects.toThrow(
    "Administrator",
  );
});

it("admin can hide the public archive while preserving private tools and individual shared pages", async () => {
  const { t, admin, publicId } = await setup();
  expect(await t.query(api.growth.visibility, {})).toBe(true);
  await expect(
    t.mutation(api.growth.setHistoryVisibility, { enabled: false }),
  ).rejects.toThrow("Administrator");
  await admin.mutation(api.growth.setHistoryVisibility, { enabled: false });
  expect(await t.query(api.growth.visibility, {})).toBe(false);
  expect(await t.query(internal.growth.history, {})).toBeNull();
  expect((await admin.query(api.growth.adminHistory, {})).entries).toHaveLength(
    1,
  );
  expect(
    await t.query(internal.owners.sharedTakeover, { publicId }),
  ).not.toBeNull();
  await admin.mutation(api.growth.setHistoryVisibility, { enabled: true });
  expect((await t.query(internal.growth.history, {}))?.entries).toHaveLength(1);
});

it("excludes authenticated owner visits, including another placement by the same email", async () => {
  const { t, source, publicId, create, pay } = await setup();
  const token = "a".repeat(64);
  const { sha } = await import("../lib/audit");
  await t.run((ctx) =>
    ctx.db.insert("ownerAccess", {
      takeoverId: source.takeoverId,
      seed: "test",
      tokenHash: sha(token),
      unsubscribeHash: "test",
      weeklyDigestEnabled: false,
      createdAt: Date.now(),
    }),
  );
  const visit = { publicId, visitorHash: "a".repeat(64), ownerToken: token };
  expect(await t.mutation(internal.growth.visit, visit)).toBe(false);
  const other = await create();
  await pay(other.takeoverId);
  const second = (await t.run((ctx) => ctx.db.get(other.takeoverId)))!;
  expect(
    await t.mutation(internal.growth.visit, {
      ...visit,
      publicId: second.publicTakeoverId!,
    }),
  ).toBe(false);
  expect(
    (await t.run((ctx) => ctx.db.get(source.takeoverId)))!.shareVisitors ?? 0,
  ).toBe(0);
});

it.each([true, false])("deduplicates opaque webhook referrals across delivery order (direct first: %s)", async directFirst => {
  const { t, source, publicId } = await setup();
  const visitorHash = "c".repeat(64), tokenHash = "d".repeat(64);
  await t.mutation(internal.growth.prepareReferral, { publicId, visitorHash, tokenHash });
  const issuedAt = Date.now();
  vi.setSystemTime(issuedAt + 5100);
  const callback = { publicId, tokenHash, occurredAt: Date.now() };
  if (directFirst) await t.mutation(internal.growth.visit, { publicId, visitorHash });
  expect(await t.mutation(internal.growth.receiveReferral, callback)).toBe(true);
  await t.mutation(internal.growth.visit, { publicId, visitorHash });
  await t.mutation(internal.growth.receiveReferral, callback);
  expect((await t.run(ctx => ctx.db.get(source.takeoverId)))?.shareVisitors).toBe(1);
  expect(await t.run(ctx => ctx.db.query("referralVisits").collect())).toHaveLength(1);
});
it("rejects unmatched, premature, stale and expired callbacks and owner self-referrals", async () => {
  const { t, publicId, source } = await setup();
  const tokenHash = "d".repeat(64);
  const issuedAt = Date.now();
  await t.mutation(internal.growth.prepareReferral, { publicId, visitorHash: "c".repeat(64), tokenHash });
  for (const callback of [
    { publicId, tokenHash, occurredAt: issuedAt + 4999 },
    { publicId: "ttw_" + "0".repeat(32), tokenHash, occurredAt: issuedAt + 5100 },
    { publicId, tokenHash: "e".repeat(64), occurredAt: issuedAt + 5100 },
    { publicId, tokenHash, occurredAt: issuedAt + 120001 },
  ]) {
    vi.setSystemTime(issuedAt + 130000);
    expect(await t.mutation(internal.growth.receiveReferral, callback)).toBe(false);
  }
  vi.setSystemTime(issuedAt + 86400_001);
  expect(await t.mutation(internal.growth.receiveReferral, { publicId, tokenHash, occurredAt: issuedAt + 5100 })).toBe(false);
  vi.stubEnv("CLAIM_TOKEN_SECRET", "c".repeat(40));
  const access = await t.run(ctx => ensureOwnerAccess(ctx, source.takeoverId));
  await t.mutation(internal.growth.prepareReferral, { publicId, visitorHash: "e".repeat(64), tokenHash: "f".repeat(64), ownerTokenHash: access!.tokenHash });
  vi.setSystemTime(Date.now() + 5100);
  expect(await t.mutation(internal.growth.receiveReferral, { publicId, tokenHash: "f".repeat(64), occurredAt: Date.now() })).toBe(false);
});
