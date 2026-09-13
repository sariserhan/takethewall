import { flushAnalytics, deliverDue } from "./backend-work-helpers";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.ts");
const make = () => convexTest(schema, modules);
type T = ReturnType<typeof make>;
async function seed(t: T) {
  const storageId = await t.run(async (ctx) =>
    ctx.storage.store(new Blob(["image"], { type: "image/webp" })),
  );
  const id = await t.mutation(internal.wall.seed, { logoStorageId: storageId });
  const owner = await t.run((ctx) => ctx.db.get(id));
  return { id, storageId: owner!.logoStorageId! };
}
let serial = 0;
async function pending(t: T) {
  const n = ++serial;
  const { storageId } = await seed(t);
  const ownerHash = "owner" + n,
    uploadKey = "upload" + n;
  await t.mutation(internal.uploads.reserve, { key: uploadKey, ownerHash });
  await t.mutation(internal.uploads.finish, { key: uploadKey, storageId });
  const args = {
    requestKey: "request" + n,
    fingerprint: "fingerprint" + n,
    tokenHash: "token" + n,
    ownerHash,
    uploadKey,
    websiteUrl: `https://site${n}.com/`,
    description: "A website",
    buyerEmail: `Buyer+${n}@example.com`,
    environment: "test" as const,
  };
  const p = await t.mutation(internal.purchases.pending, args);
  return { ...p, args };
}
function payment(takeoverId: Id<"takeovers">, suffix: string) {
  return {
    takeoverId,
    eventId: "evt_" + suffix,
    sessionId: "cs_" + suffix,
    paymentIntentId: "pi_" + suffix,
    amountCents: 499,
    currency: "usd",
    paid: true,
    livemode: false,
    receiptEmail: "receipt@example.com",
  };
}
async function active(t: T) {
  const p = await pending(t);
  await t.mutation(
    internal.purchases.activate,
    payment(p.takeoverId, p.takeoverId),
  );
  return p;
}
function event(
  takeoverId: Id<"takeovers">,
  extra: Record<string, unknown> = {},
) {
  return {
    takeoverId,
    visitorHash: "visitor",
    pageId: "page",
    eventId: "event",
    event: "impression" as "impression" | "click",
    region: "US",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 300_000,
    excluded: false,
    ...extra,
  };
}
beforeEach(() => {
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  vi.stubEnv("PUBLIC_METRICS_ENABLED", "true");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("ownership and payments", () => {
  it("seeds one house without a paid count", async () => {
    const t = make();
    const a = await seed(t),
      b = await seed(t);
    expect(a.id).toBe(b.id);
    expect(await t.query(api.wall.current, {})).toMatchObject({
      totalTakeovers: 0,
      owner: { kind: "initial_house" },
    });
  });
  it("creates one pending purchase for retries without exposing private data", async () => {
    const t = make(),
      p = await pending(t);
    const retry = await t.mutation(internal.purchases.pending, p.args);
    expect(retry.takeoverId).toBe(p.takeoverId);
    await expect(
      t.mutation(internal.purchases.pending, {
        ...p.args,
        fingerprint: "changed",
      }),
    ).rejects.toThrow();
    const publicJson = JSON.stringify(await t.query(api.wall.current, {}));
    for (const forbidden of [
      "buyerEmail",
      "receiptEmail",
      "tokenHash",
      "sessionId",
      "paymentIntentId",
      "@example.com",
    ])
      expect(publicJson).not.toContain(forbidden);
  });
  it("atomically activates, replaces, sequences and starts zero counters", async () => {
    const t = make();
    const a = await active(t);
    vi.setSystemTime(Date.now() + (3000));
    const b = await active(t);
    const old = await t.run((ctx) => ctx.db.get(a.takeoverId));
    expect(old).toMatchObject({ status: "replaced", endReason: "purchase" });
    expect(old!.replacedAt! - old!.activatedAt!).toBe(3000);
    expect(await t.query(api.wall.current, {})).toMatchObject({
      totalTakeovers: 2,
      owner: {
        id: b.takeoverId,
        activationSequence: 2,
        impressions: 0,
        clicks: 0,
        uniqueVisitors: 0,
      },
    });
  });
  it("deduplicates same and different Stripe events for one payment", async () => {
    const t = make(),
      p = await pending(t),
      data = payment(p.takeoverId, "one");
    await t.mutation(internal.purchases.activate, data);
    expect(await t.mutation(internal.purchases.activate, data)).toMatchObject({
      activated: false,
    });
    await t.mutation(internal.purchases.activate, {
      ...data,
      eventId: "evt_other",
    });
    expect(await t.query(api.wall.current, {})).toMatchObject({
      totalTakeovers: 1,
    });
    expect((await t.run((ctx) => ctx.db.query("jobs").collect())).map(j=>j.kind)).toEqual(["activation_email"]);
  });
  it("rejects failed/wrong amount/currency/environment and payment conflicts", async () => {
    const t = make(),
      p = await pending(t),
      data = payment(p.takeoverId, "one");
    for (const patch of [
      { paid: false },
      { amountCents: 298 },
      { currency: "eur" },
      { livemode: true },
    ])
      await expect(
        t.mutation(internal.purchases.activate, { ...data, ...patch }),
      ).rejects.toThrow();
    expect(await t.query(api.wall.current, {})).toMatchObject({
      totalTakeovers: 0,
    });
    await t.mutation(internal.purchases.activate, data);
    const p2 = await pending(t);
    await expect(
      t.mutation(internal.purchases.activate, {
        ...data,
        takeoverId: p2.takeoverId,
        eventId: "evt_two",
      }),
    ).rejects.toThrow();
  });
  it("serializes competing successful purchases into one active owner", async () => {
    const t = make(),
      a = await pending(t),
      b = await pending(t);
    await Promise.all([
      t.mutation(internal.purchases.activate, payment(a.takeoverId, "a")),
      t.mutation(internal.purchases.activate, payment(b.takeoverId, "b")),
    ]);
    const current = await t.query(api.wall.current, {});
    expect(current?.totalTakeovers).toBe(2);
    expect(current?.owner.activationSequence).toBe(2);
    const rows = await t.run((ctx) =>
      ctx.db
        .query("takeovers")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect(),
    );
    expect(rows).toHaveLength(1);
  });
  it("reports pending, active, replaced, invalid and expired purchase state", async () => {
    const t = make(),
      p = await pending(t),
      args = { tokenHash: p.args.tokenHash };
    expect(
      await t.mutation(internal.purchases.confirmation, args),
    ).toMatchObject({
      state: "pending",
      owner: null,
    });
    await t.mutation(internal.purchases.activate, payment(p.takeoverId, "one"));
    expect(
      await t.mutation(internal.purchases.confirmation, args),
    ).toMatchObject({
      state: "active",
    });
    vi.setSystemTime(Date.now() + (2500));
    await active(t);
    expect(
      await t.mutation(internal.purchases.confirmation, args),
    ).toMatchObject({
      state: "replaced",
      durationMs: 2500,
    });
    expect(
      await t.mutation(internal.purchases.confirmation, { tokenHash: "wrong" }),
    ).toMatchObject({ state: "invalid", owner: null });
    vi.setSystemTime(Date.now() + (49 * 3600_000));
    expect(
      await t.mutation(internal.purchases.confirmation, args),
    ).toMatchObject({
      state: "expired",
      owner: null,
    });
  });
  it("keeps final receipt address separate from original buyer email", async () => {
    const t = make(),
      p = await active(t);
    const contact = await t.run((ctx) => ctx.db.get(p.purchaseId));
    expect(contact?.buyerEmail).toBe(p.args.buyerEmail);
    expect(contact?.receiptEmail).toBe("receipt@example.com");
  });
});
describe("attribution and abuse controls", () => {
  it("deduplicates impressions per page and visitors per reign/day/lifetime", async () => {
    const t = make(),
      p = await active(t);
    await t.mutation(internal.analytics.record, event(p.takeoverId));
    await t.mutation(
      internal.analytics.record,
      event(p.takeoverId, { eventId: "retry" }),
    );
    await t.mutation(
      internal.analytics.record,
      event(p.takeoverId, { pageId: "reload", eventId: "new" }),
    );
    await flushAnalytics(t);
    expect(await t.query(api.wall.current, {})).toMatchObject({
      totalVisitors: 1,
      visitorsToday: 1,
      owner: { impressions: 2, uniqueVisitors: 1 },
      regions: [{ regionCode: "US", impressions: 2 }],
    });
    vi.setSystemTime(Date.now() + (86400_000));
    await t.mutation(
      internal.analytics.record,
      event(p.takeoverId, { pageId: "tomorrow" }),
    );
    await flushAnalytics(t);
    expect(await t.query(api.wall.current, {})).toMatchObject({
      totalVisitors: 1,
      visitorsToday: 1,
      owner: { impressions: 3, uniqueVisitors: 1 },
    });
    const next = await active(t);
    await t.mutation(
      internal.analytics.record,
      event(next.takeoverId, { pageId: "tomorrow" }),
    );
    await flushAnalytics(t);
    expect(await t.query(api.wall.current, {})).toMatchObject({
      totalVisitors: 1,
      visitorsToday: 1,
      owner: { impressions: 1, uniqueVisitors: 1 },
    });
  });
  it("counts distinct clicks but not duplicate transport delivery", async () => {
    const t = make(),
      p = await active(t);
    const e = event(p.takeoverId, { event: "click" });
    await t.mutation(internal.analytics.record, e);
    await t.mutation(internal.analytics.record, e);
    await t.mutation(internal.analytics.record, { ...e, eventId: "another" });
    await flushAnalytics(t);
    expect(await t.query(api.wall.current, {})).toMatchObject({
      owner: { clicks: 2 },
    });
  });
  it("attributes bounded late events to the displayed owner, not replacement", async () => {
    const t = make(),
      p = await active(t),
      e = event(p.takeoverId);
    vi.setSystemTime(Date.now() + (1000));
    await active(t);
    await t.mutation(internal.analytics.record, e);
    expect(await t.query(api.wall.current, {})).toMatchObject({
      owner: { impressions: 0 },
    });
    await flushAnalytics(t);
    expect(await t.run((ctx) => ctx.db.get(p.takeoverId))).toMatchObject({
      impressions: 1,
    });
    vi.setSystemTime(Date.now() + (121_000));
    await expect(
      t.mutation(internal.analytics.record, { ...e, pageId: "late" }),
    ).rejects.toThrow();
  });
  it("rejects expired contexts and ignores excluded traffic", async () => {
    const t = make(),
      p = await active(t);
    expect(
      await t.mutation(
        internal.analytics.record,
        event(p.takeoverId, { excluded: true }),
      ),
    ).toBe(false);
    await expect(
      t.mutation(
        internal.analytics.record,
        event(p.takeoverId, { expiresAt: Date.now() - 1 }),
      ),
    ).rejects.toThrow();
    vi.stubEnv("PUBLIC_METRICS_ENABLED", "false");
    expect(
      await t.mutation(internal.analytics.record, event(p.takeoverId)),
    ).toBe(false);
    await flushAnalytics(t);
    expect(await t.query(api.wall.current, {})).toMatchObject({
      totalVisitors: 0,
    });
  });
  it("rate limits uploads, submissions and events", async () => {
    const t = make();
    for (let i = 0; i < 6; i++)
      await t.mutation(internal.uploads.reserve, {
        key: "u" + i,
        ownerHash: "abuser",
      });
    await expect(
      t.mutation(internal.uploads.reserve, {
        key: "extra",
        ownerHash: "abuser",
      }),
    ).rejects.toThrow("Too many requests");
    const p = await active(t);
    for (let i = 0; i < 20; i++)
      await t.mutation(
        internal.analytics.record,
        event(p.takeoverId, { event: "click", eventId: "click" + i }),
      );
    await expect(
      t.mutation(
        internal.analytics.record,
        event(p.takeoverId, { event: "click", eventId: "over" }),
      ),
    ).rejects.toThrow("Too many requests");
    for (let i = 0; i < 9; i++)
      await t.mutation(internal.purchases.pending, p.args).catch(() => {});
    await expect(
      t.mutation(internal.purchases.pending, p.args),
    ).rejects.toThrow();
  });
  it("deletes unreferenced expired uploads but preserves historical assets", async () => {
    const t = make();
    const { storageId } = await seed(t);
    const unreferenced = await t.run((ctx) =>
      ctx.storage.store(new Blob(["orphan"])),
    );
    await t.mutation(internal.uploads.reserve, {
      key: "orphan",
      ownerHash: "one",
    });
    await t.mutation(internal.uploads.finish, {
      key: "orphan",
      storageId: unreferenced,
    });
    await t.mutation(internal.uploads.reserve, {
      key: "used",
      ownerHash: "two",
    });
    await t.mutation(internal.uploads.finish, { key: "used", storageId });
    vi.setSystemTime(Date.now() + (49 * 3600_000));
    await t.mutation(internal.operations.cleanup, {});
    expect(await t.run((ctx) => ctx.storage.getUrl(unreferenced))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
  });
});
describe("moderation and delivery", () => {
  it("creates a fresh restoration and preserves paid history and totals", async () => {
    const t = make(),
      a = await active(t);
    await t.mutation(internal.analytics.record, event(a.takeoverId));
    vi.setSystemTime(Date.now() + (1000));
    const b = await active(t);
    const historic = await t.run((ctx) => ctx.db.get(a.takeoverId));
    const args = {
      expectedCurrentId: b.takeoverId,
      reason: "Phishing",
      operatorReference: "incident-1",
    };
    const restored = await t.mutation(internal.operations.disable, args);
    expect(await t.mutation(internal.operations.disable, args)).toBe(restored);
    expect(await t.run((ctx) => ctx.db.get(a.takeoverId))).toEqual(historic);
    expect(await t.query(api.wall.current, {})).toMatchObject({
      totalTakeovers: 2,
      owner: {
        id: restored,
        kind: "moderation_restoration",
        activationSequence: 3,
        impressions: 0,
      },
    });
    await active(t);
    expect(await t.query(api.wall.current, {})).toMatchObject({
      totalTakeovers: 3,
      owner: { activationSequence: 4, kind: "paid" },
    });
  });
  it("isolates provider failure and retries without rolling back activation", async () => {
    const t = make(),
      p = await active(t);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unavailable")));
    vi.stubEnv("RESEND_API_KEY", "test");
    vi.stubEnv("RESEND_FROM", "Take The Wall <notify@takethewall.com>");
    await deliverDue(t);
    expect(await t.query(api.wall.current, {})).toMatchObject({
      owner: { id: p.takeoverId },
    });
    const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
    const email = jobs.find((j) => j.kind === "activation_email")!;
    expect(email).toMatchObject({ state: "pending", attempts: 1 });
    vi.setSystemTime(Date.now() + (31_000));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    await deliverDue(t);
    expect(await t.run((ctx) => ctx.db.get(email._id))).toMatchObject({
      state: "sent",
      attempts: 2,
    });
    await deliverDue(t);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retires legacy VisitorPing jobs without sending while email retries and payment counts remain intact", async () => {
    const t = make(),
      p = await active(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(p.purchaseId, { environment: "production" });
    });
    await t.run((ctx) =>
      ctx.db.insert("jobs", {
        key: "legacy-vp",
        kind: "takeover_activated",
        takeoverId: p.takeoverId,
        deliveryId: "legacy",
        timestamp: Date.now(),
        state: "pending",
        attempts: 0,
        nextAt: 0,
      }),
    );
    vi.stubEnv("VISITORPING_SITE_KEY", "vp_ABCD2345");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await deliverDue(t);
    const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
    expect(jobs.find((j) => j.kind === "takeover_activated")).toMatchObject({
      state: "sent",
      attempts: 0,
    });
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(
          ([url]) => !String(url).includes("ingest.visitorping.com"),
        ),
    ).toBe(true);
    expect(jobs.find((j) => j.kind === "activation_email")).toMatchObject({
      state: "pending",
      attempts: 1,
    });
    expect(await t.query(api.wall.current, {})).toMatchObject({
      totalTakeovers: 1,
    });
  });
});

it("cleans confirmed abandoned purchases but retains unresolved Stripe sessions", async () => {
  const t = make(),
    abandoned = await pending(t),
    unresolved = await pending(t);
  await t.mutation(internal.purchases.attach, {
    purchaseId: unresolved.purchaseId,
    sessionId: "cs_unresolved",
    checkoutUrl: "https://checkout.stripe.com/test",
  });
  vi.setSystemTime(Date.now() + (73 * 3600_000));
  await t.mutation(internal.operations.cleanup, {});
  expect(await t.run((ctx) => ctx.db.get(abandoned.purchaseId))).toBeNull();
  expect(
    await t.run((ctx) => ctx.db.get(unresolved.purchaseId)),
  ).not.toBeNull();
  await t.mutation(internal.purchases.expire, {
    takeoverId: unresolved.takeoverId,
    sessionId: "cs_unresolved",
    livemode: false,
  });
  vi.setSystemTime(Date.now() + (49 * 3600_000));
  await t.mutation(internal.operations.cleanup, {});
  expect(await t.run((ctx) => ctx.db.get(unresolved.purchaseId))).toBeNull();
});

it.each([
  "https://example.com",
  "https://apps.apple.com/app/id123",
  "https://instagram.com/example",
])("accepts linked placements without an image: %s", async (websiteUrl) => {
  const t = make();
  await seed(t);
  const args = {
    requestKey: "optional-image",
    fingerprint: "fp",
    tokenHash: "token",
    ownerHash: "owner",
    uploadKey: "",
    websiteUrl,
    description: "No image needed",
    buyerEmail: "buyer@example.com",
    environment: "test" as const,
  };
  const result = await t.mutation(internal.purchases.pending, args);
  expect(
    (await t.run((ctx) => ctx.db.get(result.takeoverId)))?.logoStorageId,
  ).toBeUndefined();
  await expect(
    t.mutation(internal.purchases.pending, {
      ...args,
      requestKey: "bad-image",
      uploadKey: "missing-upload",
    }),
  ).rejects.toThrow("Upload expired");
});

it("production Stripe activation queues one admin notification with payment details", async () => {
  const t = make(),
    p = await pending(t);
  await t.run(async (ctx) => {
    const purchase = (await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", p.takeoverId))
      .unique())!;
    await ctx.db.patch(purchase._id, { environment: "production" });
  });
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  const args = {
    ...payment(p.takeoverId, "prod-notification"),
    livemode: true,
  };
  await t.mutation(internal.purchases.activate, args);
  await t.mutation(internal.purchases.activate, {
    ...args,
    eventId: "evt_prod-retry",
  });
  const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
  const notices = jobs.filter((j) => j.kind === "admin_takeover_email");
  expect(notices).toHaveLength(1);
  expect(notices[0].adminNotice?.body).toContain("Amount: 4.99 USD");
  expect(notices[0].adminNotice?.body).toContain("pi_prod-notification");
  expect(notices[0].adminNotice?.body).toContain(p.args.buyerEmail);
  expect(notices[0].adminNotice?.body).toContain("receipt@example.com");
});

it("funnel counts measured page loads, unique checkout creation and paid activation, excluding admin access and duplicates", async () => {
  const t = make(),
    p = await pending(t);
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const before = (await t.query(api.wall.current, {}))!.owner.id;
  await t.run(async (ctx) => {
    const purchase = (await ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", p.takeoverId))
      .unique())!;
    await ctx.db.patch(purchase._id, { environment: "production" });
  });
  const args = event(before, {
    pageId: "funnel-page",
    eventId: "funnel-first",
  });
  await t.mutation(internal.analytics.record, args);
  await t.mutation(internal.analytics.record, args);
  const purchase = (await t.run((ctx) =>
    ctx.db
      .query("purchases")
      .withIndex("by_takeoverId", (q) => q.eq("takeoverId", p.takeoverId))
      .unique(),
  ))!;
  await t.mutation(internal.purchases.attach, {
    purchaseId: purchase._id,
    sessionId: "cs_funnel",
    checkoutUrl: "",
  });
  await t.mutation(internal.purchases.attach, {
    purchaseId: purchase._id,
    sessionId: "cs_funnel",
    checkoutUrl: "",
  });
  const paid = { ...payment(p.takeoverId, "funnel"), livemode: true };
  await t.mutation(internal.purchases.activate, paid);
  await t.mutation(internal.purchases.activate, paid);
  await t.mutation(
    internal.analytics.record,
    event(p.takeoverId, { pageId: "funnel-page", eventId: "funnel-second" }),
  );
  await t.mutation(
    internal.analytics.record,
    event(p.takeoverId, {
      pageId: "excluded-page",
      eventId: "excluded",
      excluded: true,
    }),
  );
  await flushAnalytics(t);
  const date = new Date().toISOString().slice(0, 10);
  await expect(
    t.query(api.funnel.report, { from: date, to: date }),
  ).rejects.toThrow("Administrator access");
  const admin = t.withIdentity({
    subject: "admin",
    email: "admin@example.com",
    emailVerified: true,
  });
  expect(
    await admin.query(api.funnel.report, { from: date, to: date }),
  ).toMatchObject({
    visits: 1,
    checkoutStarts: 1,
    paidActivations: 1,
    daysTracked: 1,
  });
});

it("delivery controls require admin and preserve email idempotency and retry windows", async () => {
  const t = make();
  const p = await pending(t);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const admin = t.withIdentity({
    subject: "admin",
    email: "admin@example.com",
    emailVerified: true,
  });
  await expect(t.query(api.deliveryAdmin.overview, {})).rejects.toThrow(
    "Administrator",
  );
  const id = await t.run((ctx) =>
    ctx.db.insert("jobs", {
      key: "retry-test",
      kind: "activation_email",
      takeoverId: p.takeoverId,
      deliveryId: "stable",
      timestamp: Date.now(),
      state: "failed",
      attempts: 12,
      nextAt: Date.now(),
    }),
  );
  await expect(
    t.mutation(api.deliveryAdmin.retry, { queue: "jobs", id }),
  ).rejects.toThrow("Administrator");
  await admin.mutation(api.deliveryAdmin.retry, { queue: "jobs", id });
  expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
    key: "retry-test",
    deliveryId: "stable",
    state: "pending",
    attempts: 0,
  });
  await expect(
    admin.mutation(api.deliveryAdmin.retry, { queue: "jobs", id }),
  ).rejects.toThrow("Only failed");
  await t.run((ctx) =>
    ctx.db.patch(id, {
      state: "failed",
      timestamp: Date.now() - 24 * 3600_000,
    }),
  );
  await expect(
    admin.mutation(api.deliveryAdmin.retry, { queue: "jobs", id }),
  ).rejects.toThrow("safe retry window");
  const raw = JSON.parse(await admin.query(api.deliveryAdmin.overview, {}));
  expect(raw.emails[0].retryBefore).toBeLessThan(Date.now());
  expect(raw.activations[0].id).toBe(p.takeoverId);
});
it("email recovery finds case-insensitive purchases without publishing unpaid drafts and sends only to matching contacts", async () => {
  vi.stubEnv(
    "CLAIM_TOKEN_SECRET",
    "recovery-secret-at-least-thirty-two-characters",
  );
  const t = make(),
    p = await pending(t);
  expect(
    await t.mutation(internal.recovery.find, {
      email: p.args.buyerEmail.toUpperCase(),
      ipHash: "a",
    }),
  ).toEqual([{ takeoverId: p.takeoverId, sessionId: null, paid: false }]);
  await t.mutation(internal.recovery.sendLink, {
    takeoverId: p.takeoverId,
    email: p.args.buyerEmail,
  });
  expect(
    await t.run((ctx) => ctx.db.query("ownerAccess").collect()),
  ).toHaveLength(0);
  await t.mutation(
    internal.purchases.activate,
    payment(p.takeoverId, "recovery"),
  );
  await t.mutation(internal.recovery.sendLink, {
    takeoverId: p.takeoverId,
    email: "intruder@example.com",
  });
  await t.mutation(internal.recovery.sendLink, {
    takeoverId: p.takeoverId,
    email: "receipt@example.com",
  });
  await t.mutation(internal.recovery.sendLink, {
    takeoverId: p.takeoverId,
    email: "receipt@example.com",
  });
  const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
  const recovery = jobs.filter((j) => j.key.includes("recovery:"));
  expect(recovery).toHaveLength(1);
  expect(recovery[0].recoveryToReceipt).toBe(true);
  expect(
    (await t.query(internal.jobs.data, { id: recovery[0]._id }))?.email,
  ).toBe("receipt@example.com");
  await t.mutation(internal.operations.deleteContact, {
    purchaseId: p.purchaseId,
  });
  expect(
    await t.mutation(internal.recovery.find, {
      email: p.args.buyerEmail,
      ipHash: "b",
    }),
  ).toEqual([]);
  expect(
    (await t.query(internal.jobs.data, { id: recovery[0]._id }))?.email,
  ).toBe("");
});
it("legacy recovery contact indexing is bounded and preserves records", async () => {
  const t = make(),
    p = await pending(t);
  await t.run((ctx) =>
    ctx.db.patch(p.purchaseId, {
      buyerEmailKey: undefined,
      receiptEmail: "RECEIPT@example.com",
    }),
  );
  expect(await t.mutation(internal.recovery.indexContacts, {})).toBe(1);
  expect(await t.mutation(internal.recovery.indexContacts, {})).toBe(0);
  expect(
    await t.mutation(internal.recovery.find, {
      email: "receipt@example.com",
      ipHash: "legacy",
    }),
  ).toHaveLength(1);
});

it("resume links are private, deduplicated and suppressed after payment or expiry", async () => {
  vi.stubEnv("CLAIM_TOKEN_SECRET", "resume-test-secret-at-least-32-characters");
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  const { checkoutResumeToken } = await import("../lib/owner-secrets");
  const { sha } = await import("../lib/audit");
  const t = make(), p = await pending(t);
  await t.mutation(internal.purchases.attach, { purchaseId: p.purchaseId, sessionId: "cs_saved", checkoutUrl: "" });
  await t.mutation(internal.recovery.requestResume, { tokenHash: "wrong" });
  expect(await t.run(ctx => ctx.db.query("jobs").collect())).toHaveLength(0);
  await t.mutation(internal.recovery.requestResume, { tokenHash: p.args.tokenHash });
  await t.mutation(internal.recovery.requestResume, { tokenHash: p.args.tokenHash });
  const jobs = await t.run(ctx => ctx.db.query("jobs").collect());
  expect(jobs).toHaveLength(1); expect(jobs[0].kind).toBe("checkout_resume_email");
  const purchase = (await t.run(ctx => ctx.db.get(p.purchaseId)))!;
  const tokenHash = sha(checkoutResumeToken(purchase.resumeSeed!));
  expect((await t.query(internal.recovery.resume, { tokenHash }))?.sessionId).toBe("cs_saved");
  expect(await t.query(internal.recovery.resume, { tokenHash: "b".repeat(64) })).toBeNull();
  expect((await t.query(internal.jobs.data, { id: jobs[0]._id }))?.deliveryAllowed).toBe(true);
  await t.run(ctx => ctx.db.patch(p.purchaseId, { paidAt: Date.now() }));
  expect((await t.query(internal.jobs.data, { id: jobs[0]._id }))?.deliveryAllowed).toBe(false);
  await t.run(ctx => ctx.db.patch(p.purchaseId, { tokenExpiresAt: Date.now() - 1 }));
  expect(await t.query(internal.recovery.resume, { tokenHash })).toBeNull();
});

it("admin payment labels and timeline use recorded facts without exposing checkout secrets", async () => {
  vi.stubEnv("ADMIN_USER_IDS", "admin-test");
  const t = make(), p = await pending(t), admin = t.withIdentity({ subject: "admin-test" });
  await t.mutation(internal.purchases.attach, { purchaseId: p.purchaseId, sessionId: "cs_timeline", checkoutUrl: "" });
  const list = (await admin.query(api.admin.list, { section: "takeovers" }));
  expect(list.rows.find(r => r._id === p.takeoverId)).toMatchObject({paymentStatus: "Awaiting payment"});
  await expect(t.query(api.deliveryAdmin.timeline, { takeoverId: p.takeoverId })).rejects.toThrow();
  await t.mutation(internal.deliveryAdmin.recordStripeCheck, { takeoverId: p.takeoverId, sessionId: "cs_timeline", environment: "test", actor: "admin-test", status: "processing" });
  await enqueueTimelineJob();
  async function enqueueTimelineJob() {
    await t.run(async ctx => {
      await ctx.db.insert("jobs", { key: "timeline-resume", kind: "checkout_resume_email", takeoverId: p.takeoverId, deliveryId: "delivery", timestamp: Date.now(), state: "sent", attempts: 0, nextAt: Date.now(), sentAt: Date.now() });
    });
  }
  const timeline = await admin.query(api.deliveryAdmin.timeline, { takeoverId: p.takeoverId });
  expect(timeline.events.map(e => e.label)).toEqual(expect.arrayContaining(["Checkout draft created", "Stripe checkout attached", "Stripe checked: processing", "Resume email queued"]));
  expect(timeline.events.some(e => e.label.includes("accepted by Resend"))).toBe(false);
  expect(timeline.notes.join(" ")).toContain("may have been skipped");
  expect(JSON.stringify(timeline)).not.toContain(p.args.tokenHash);
  expect((await t.run(ctx => ctx.db.get(p.purchaseId)))?.paidAt).toBeUndefined();
});

it("checkout pause is admin-only, preserves the wall and lets existing payments publish", async () => {
  vi.stubEnv("ADMIN_USER_IDS", "admin-test");
  const t = make(), p = await pending(t), admin = t.withIdentity({subject:"admin-test"});
  const before = await t.query(api.checkoutControls.state, {});
  await expect(t.mutation(api.checkoutControls.setPaused, {paused:true})).rejects.toThrow();
  await admin.mutation(api.checkoutControls.setPaused, {paused:true});
  expect(await t.query(api.checkoutControls.state, {})).toMatchObject({paused:true,ownerId:before.ownerId});
  await expect(t.mutation(internal.purchases.pending,{...p.args,requestKey:"new-paused"})).rejects.toThrow("paused");
  await t.mutation(internal.purchases.activate,payment(p.takeoverId,"during-pause"));
  expect((await t.query(api.wall.current, {}))?.owner.id).toBe(p.takeoverId);
  await admin.mutation(api.checkoutControls.setPaused,{paused:false});
  expect((await t.query(api.checkoutControls.state, {})).paused).toBe(false);
});
it("stale owner review cannot create a new purchase", async () => {
  const t = make(), p = await pending(t);
  const old = await t.query(api.checkoutControls.state, {});
  await t.mutation(internal.purchases.activate,payment(p.takeoverId,"new-owner"));
  await expect(t.mutation(internal.purchases.pending,{...p.args,requestKey:"stale-review",expectedCurrentId:old.ownerId})).rejects.toThrow("wall changed");
  expect(await t.run(ctx=>ctx.db.query("purchases").collect())).toHaveLength(1);
});
it("verified live publication failures queue one admin alert and record payment status", async () => {
  const t = make(), p = await pending(t);
  await t.mutation(internal.purchases.attach,{purchaseId:p.purchaseId,sessionId:"cs_failure",checkoutUrl:""});
  await t.run(ctx=>ctx.db.patch(p.purchaseId,{environment:"production"}));
  vi.stubEnv("WALL_ENVIRONMENT","production");
  const args={takeoverId:p.takeoverId,sessionId:"cs_failure",paymentIntentId:"pi_failure",livemode:true};
  await t.mutation(internal.checkoutControls.publicationFailure,{...args,sessionId:"cs_wrong"});
  expect(await t.run(ctx=>ctx.db.query("jobs").collect())).toHaveLength(0);
  await t.mutation(internal.checkoutControls.publicationFailure,args);
  await t.mutation(internal.checkoutControls.publicationFailure,args);
  const jobs=await t.run(ctx=>ctx.db.query("jobs").collect());
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({kind:"admin_payment_failure_email",adminRecipient:"serhan.sari@yahoo.com"});
  expect(jobs[0].adminNotice?.body).toContain("pi_failure");
  expect((await t.run(ctx=>ctx.db.get(p.purchaseId)))?.stripeStatus).toBe("paid");
  expect((await t.run(ctx=>ctx.db.get(p.purchaseId)))?.paidAt).toBeUndefined();
});
it("admin filters match payment status and environment without exposing records anonymously", async () => {
  vi.stubEnv("ADMIN_USER_IDS","admin-test");
  const t=make(),p=await pending(t),admin=t.withIdentity({subject:"admin-test"});
  await expect(t.query(api.admin.list,{section:"takeovers",paymentStatus:"Awaiting payment"})).rejects.toThrow();
  const read=async (paymentStatus:string,environment:"test"|"production")=>(await admin.query(api.admin.list,{section:"takeovers",paymentStatus,environment}));
  expect((await read("Awaiting payment","test")).rows.map((r:{_id:string})=>r._id)).toEqual([p.takeoverId]);
  expect((await read("Paid","test")).rows).toEqual([]);
  expect((await read("Awaiting payment","production")).rows).toEqual([]);
});
it("test-mode publication failures do not queue admin email",async()=>{
  const t=make(),p=await pending(t);
  await t.mutation(internal.purchases.attach,{purchaseId:p.purchaseId,sessionId:"cs_test_failure",checkoutUrl:""});
  await t.mutation(internal.checkoutControls.publicationFailure,{takeoverId:p.takeoverId,sessionId:"cs_test_failure",paymentIntentId:"pi_test",livemode:false});
  expect(await t.run(ctx=>ctx.db.query("jobs").collect())).toHaveLength(0);
});

it("taxed local-currency payment publishes once and stores gross, tax and presentment separately",async()=>{
  const t=make(),p=await pending(t);
  const args={...payment(p.takeoverId,"taxed-local"),amountCents:579,taxCents:80,presentmentAmount:439,presentmentCurrency:"eur"};
  await t.mutation(internal.purchases.activate,args);
  await t.mutation(internal.purchases.activate,args);
  const purchase=await t.run(ctx=>ctx.db.get(p.purchaseId));
  expect(purchase).toMatchObject({amountCents:579,taxCents:80,currency:"usd",presentmentAmount:439,presentmentCurrency:"eur"});
  expect((await t.query(api.wall.current,{}))?.totalTakeovers).toBe(1);
  const days=await t.run(ctx=>ctx.db.query("dailyStats").collect());
  expect(days[0].revenueCents).toBe(499);
});
it("rejects extra charges without matching tax and negative tax",async()=>{
  const t=make(),p=await pending(t);
  for(const patch of [{amountCents:579},{amountCents:398,taxCents:-1},{amountCents:579,taxCents:79}])
    await expect(t.mutation(internal.purchases.activate,{...payment(p.takeoverId,"bad-tax"),...patch})).rejects.toThrow("Invalid payment");
});

it("preserves an old checkout quote and rejects an old amount for a new purchase", async () => {
  const t = make(), old = await pending(t);
  await t.run(ctx => ctx.db.patch(old.purchaseId, { basePriceCents: undefined }));
  const resumed = await t.mutation(internal.purchases.pending, old.args);
  expect(resumed.basePriceCents).toBe(399);
  await t.mutation(internal.purchases.activate, { ...payment(old.takeoverId, "legacy-price"), amountCents: 399 });
  const next = await pending(t);
  expect(next.basePriceCents).toBe(499);
  await expect(t.mutation(internal.purchases.activate, { ...payment(next.takeoverId, "wrong-price"), amountCents: 399 })).rejects.toThrow("Invalid payment");
});
