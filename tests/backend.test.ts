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
    amountCents: 399,
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
    vi.advanceTimersByTime(3000);
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
    expect(await t.run((ctx) => ctx.db.query("jobs").collect())).toHaveLength(
      3,
    );
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
    vi.advanceTimersByTime(2500);
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
    vi.advanceTimersByTime(49 * 3600_000);
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
    expect(await t.query(api.wall.current, {})).toMatchObject({
      totalVisitors: 1,
      visitorsToday: 1,
      owner: { impressions: 2, uniqueVisitors: 1 },
      regions: [{ regionCode: "US", impressions: 2 }],
    });
    vi.advanceTimersByTime(86400_000);
    await t.mutation(
      internal.analytics.record,
      event(p.takeoverId, { pageId: "tomorrow" }),
    );
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
    expect(await t.query(api.wall.current, {})).toMatchObject({
      owner: { clicks: 2 },
    });
  });
  it("attributes bounded late events to the displayed owner, not replacement", async () => {
    const t = make(),
      p = await active(t),
      e = event(p.takeoverId);
    vi.advanceTimersByTime(1000);
    await active(t);
    await t.mutation(internal.analytics.record, e);
    expect(await t.query(api.wall.current, {})).toMatchObject({
      owner: { impressions: 0 },
    });
    expect(await t.run((ctx) => ctx.db.get(p.takeoverId))).toMatchObject({
      impressions: 1,
    });
    vi.advanceTimersByTime(121_000);
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
    vi.advanceTimersByTime(49 * 3600_000);
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
    vi.advanceTimersByTime(1000);
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
    await t.action(internal.jobs.dispatch, {});
    expect(await t.query(api.wall.current, {})).toMatchObject({
      owner: { id: p.takeoverId },
    });
    const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
    const email = jobs.find((j) => j.kind === "activation_email")!;
    expect(email).toMatchObject({ state: "pending", attempts: 1 });
    vi.advanceTimersByTime(31_000);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    await t.action(internal.jobs.dispatch, {});
    expect(await t.run((ctx) => ctx.db.get(email._id))).toMatchObject({
      state: "sent",
      attempts: 2,
    });
    await t.action(internal.jobs.dispatch, {});
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("persists failed VisitorPing jobs independently of payments", async () => {
    const t = make(),
      p = await active(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(p.purchaseId, { environment: "production" });
    });
    vi.stubEnv("VISITORPING_SITE_KEY", "vp_ABCD2345");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await t.action(internal.jobs.dispatch, {});
    const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
    expect(jobs.find((j) => j.kind === "takeover_activated")).toMatchObject({
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
  vi.advanceTimersByTime(73 * 3600_000);
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
  vi.advanceTimersByTime(49 * 3600_000);
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
