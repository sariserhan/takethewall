import { deliverDue } from "./backend-work-helpers";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal, api } from "../convex/_generated/api";
import {
  wallConfirmation,
  wallUnsubscribe,
} from "../lib/wall-subscription-secrets";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T08:00:00Z"));
  vi.stubEnv("CLAIM_TOKEN_SECRET", "a-test-secret-with-at-least-32-characters");
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  vi.stubEnv("SITE_URL", "https://takethewall.com");
  vi.stubEnv("ADMIN_USER_IDS", "admin-test");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function setup(frequency: "daily" | "every" = "every") {
  const t = convexTest(schema, modules);
  const logo = await t.run((ctx) => ctx.storage.store(new Blob(["logo"])));
  await t.mutation(internal.wall.seed, { logoStorageId: logo });
  await t.mutation(internal.wallSubscriptions.subscribe, {
    email: "Reader@Example.com",
    frequency,
    consent: true,
    honeypot: "",
    ipHash: "ip",
  });
  const s = (await t.run((ctx) => ctx.db.query("wallSubscribers").first()))!;
  return { t, s };
}
async function publish(
  t: Awaited<ReturnType<typeof setup>>["t"],
  name = "Studio",
) {
  return t.run(async (ctx) => {
    const site = (await ctx.db.query("siteStats").first())!;
    const sequence = site.currentActivationSequence + 1;
    const id = await ctx.db.insert("takeovers", {
      websiteUrl: "https://example.com",
      domain: "example.com",
      displayName: name,
      description: "A new project",
      kind: "paid",
      status: "active",
      blocked: false,
      createdAt: Date.now(),
      activatedAt: Date.now(),
      activationSequence: sequence,
      takeoverNumber: sequence,
      publicTakeoverId: "ttw_" + String(sequence).padStart(32, "a"),
      impressions: 0,
      uniqueVisitors: 0,
      clicks: 0,
    });
    await ctx.db.patch(site._id, {
      currentTakeoverId: id,
      currentActivationSequence: sequence,
    });
    return id;
  });
}
it("requires consent, ignores traps, and sends no notifications before confirmation", async () => {
  const { t, s } = await setup();
  await expect(
    t.mutation(internal.wallSubscriptions.subscribe, {
      email: "x@example.com",
      frequency: "daily",
      consent: false,
      honeypot: "",
      ipHash: "ip",
    }),
  ).rejects.toThrow("Confirm");
  await publish(t);
  expect(await t.mutation(internal.wallSubscriptions.queue, {})).toBe(0);
  expect(
    await t.mutation(internal.wallSubscriptions.manage, {
      token: wallUnsubscribe(s.seed),
      action: "confirm",
    }),
  ).toBe(false);
  expect(
    await t.mutation(internal.wallSubscriptions.manage, {
      token: wallConfirmation(s.seed),
      action: "confirm",
    }),
  ).toBe(true);
  expect(await t.mutation(internal.wallSubscriptions.queue, {})).toBe(0); // no historical replay
  await t.mutation(internal.wallSubscriptions.subscribe, {
    email: "trap@example.com",
    frequency: "daily",
    consent: true,
    honeypot: "spam",
    ipHash: "ip",
  });
  expect(
    await t.run((ctx) => ctx.db.query("wallSubscribers").collect()),
  ).toHaveLength(1);
});
it("delivers separate attributed takeover messages, deduplicates, and cancels queued mail on unsubscribe", async () => {
  const { t, s } = await setup();
  await t.mutation(internal.wallSubscriptions.manage, {
    token: wallConfirmation(s.seed),
    action: "confirm",
  });
  await publish(t, "First");
  await publish(t, "Second");
  expect(await t.mutation(internal.wallSubscriptions.queue, {})).toBe(2);
  expect(await t.mutation(internal.wallSubscriptions.queue, {})).toBe(0);
  const mails = (
    await t.run((ctx) => ctx.db.query("transactionalMail").collect())
  ).filter((m) => m.kind === "wall_change");
  expect(mails).toHaveLength(2);
  const payload = await t.mutation(internal.mail.prepare, { id: mails[0]._id });
  expect(payload?.body).toContain("First");
  expect(payload?.presentation?.imageUrl).toContain("/takeover/ttw_");
  expect(payload?.oneClickUnsubscribeUrl).toContain(wallUnsubscribe(s.seed));
  expect(payload?.sender.from).toContain("notifications@takethewall.com");
  await t.mutation(internal.wallSubscriptions.manage, {
    token: wallUnsubscribe(s.seed),
    action: "unsubscribe",
  });
  expect(
    await t.mutation(internal.mail.prepare, { id: mails[1]._id }),
  ).toBeNull();
  expect(
    await t.mutation(internal.wallSubscriptions.manage, {
      token: wallConfirmation(s.seed),
      action: "confirm",
    }),
  ).toBe(false);
  const log = (await t.run((ctx) =>
    ctx.db
      .query("emailHistory")
      .withIndex("by_key", (q) => q.eq("key", mails[1].key))
      .unique(),
  ))!;
  expect(log.state).toBe("skipped");
});
it("daily subscribers get one summary only when changed, and test environments never broadcast", async () => {
  const { t, s } = await setup("daily");
  await t.mutation(internal.wallSubscriptions.manage, {
    token: wallConfirmation(s.seed),
    action: "confirm",
  });
  await publish(t, "First");
  await publish(t, "Second");
  expect(await t.mutation(internal.wallSubscriptions.queue, {})).toBe(0);
  vi.advanceTimersByTime(3600_000);
  expect(await t.mutation(internal.wallSubscriptions.queue, {})).toBe(1);
  expect(await t.mutation(internal.wallSubscriptions.queue, {})).toBe(0);
  const mail = (
    await t.run((ctx) => ctx.db.query("transactionalMail").collect())
  ).find((m) => m.kind === "wall_daily")!;
  expect(mail.body).toContain("First");
  expect(mail.body).toContain("Second");
  vi.advanceTimersByTime(86400_000);
  expect(await t.mutation(internal.wallSubscriptions.queue, {})).toBe(0);
  await publish(t);
  vi.advanceTimersByTime(86400_000);
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  expect(await t.mutation(internal.wallSubscriptions.queue, {})).toBe(0);
});
it("protects preferences from unauthenticated resubmission and invalidates older queued messages on a change", async () => {
  const { t, s } = await setup();
  await t.mutation(internal.wallSubscriptions.manage, {
    token: wallConfirmation(s.seed),
    action: "confirm",
  });
  await publish(t);
  await t.mutation(internal.wallSubscriptions.queue, {});
  await t.mutation(internal.wallSubscriptions.subscribe, {
    email: s.email,
    frequency: "daily",
    consent: true,
    honeypot: "",
    ipHash: "ip",
  });
  expect((await t.run((ctx) => ctx.db.get(s._id)))?.frequency).toBe("every");
  expect(
    await t.mutation(internal.wallSubscriptions.manage, {
      token: "0".repeat(64),
      action: "frequency",
      frequency: "daily",
    }),
  ).toBe(false);
  await t.mutation(internal.wallSubscriptions.manage, {
    token: wallUnsubscribe(s.seed),
    action: "frequency",
    frequency: "daily",
  });
  const job = (
    await t.run((ctx) => ctx.db.query("transactionalMail").collect())
  ).find((m) => m.kind === "wall_change")!;
  expect(await t.mutation(internal.mail.prepare, { id: job._id })).toBeNull();
});
it("rejects expired confirmation and skips content removed after queuing", async () => {
  const { t, s } = await setup();
  vi.advanceTimersByTime(86400_000 + 1);
  expect(
    await t.mutation(internal.wallSubscriptions.manage, {
      token: wallConfirmation(s.seed),
      action: "confirm",
    }),
  ).toBe(false);
  await t.mutation(internal.wallSubscriptions.subscribe, {
    email: s.email,
    frequency: "every",
    consent: true,
    honeypot: "",
    ipHash: "ip",
  });
  const fresh = (await t.run((ctx) => ctx.db.get(s._id)))!;
  await t.mutation(internal.wallSubscriptions.manage, {
    token: wallConfirmation(fresh.seed),
    action: "confirm",
  });
  const id = await publish(t);
  await t.mutation(internal.wallSubscriptions.queue, {});
  await t.run((ctx) => ctx.db.patch(id, { blocked: true }));
  const job = (
    await t.run((ctx) => ctx.db.query("transactionalMail").collect())
  ).find((m) => m.kind === "wall_change")!;
  expect(await t.mutation(internal.mail.prepare, { id: job._id })).toBeNull();
});
it("admin directory deduplicates contacts, hides secrets, and retains webhook events arriving before send completion", async () => {
  const { t, s } = await setup();
  await t.action(internal.emailDirectory.reconcile, {});
  const args = { paginationOpts: { cursor: null, numItems: 25 } };
  await expect(t.query(api.emailDirectory.list, args)).rejects.toThrow(
    "Administrator",
  );
  await expect(
    t.query(api.emailDirectory.history, { ...args, email: s.email }),
  ).rejects.toThrow("Administrator");
  const admin = t.withIdentity({ subject: "admin-test" });
  const page = JSON.parse(await admin.query(api.emailDirectory.list, args));
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0].email).toBe("reader@example.com");
  expect(page.rows[0].wall).toBe("Pending confirmation");
  expect(JSON.stringify(page)).not.toContain(s.seed);
  const job = (await t.run((ctx) =>
    ctx.db.query("transactionalMail").first(),
  ))!;
  await t.mutation(internal.mail.prepare, { id: job._id });
  await t.mutation(internal.emailDelivery.record, {
    eventId: "delivered-1",
    emailId: "provider-1",
    type: "email.delivered",
    occurredAt: Date.now(),
  });
  await t.mutation(internal.mail.finish, {
    id: job._id,
    ok: true,
    providerId: "provider-1",
  });
  await t.mutation(internal.emailDelivery.record, {
    eventId: "delivered-1",
    emailId: "provider-1",
    type: "email.delivered",
    occurredAt: Date.now(),
  });
  const history = JSON.parse(
    await admin.query(api.emailDirectory.history, { ...args, email: s.email }),
  );
  expect(history.rows[0].state).toBe("accepted");
  expect(history.rows[0].sentAt).toBe(Date.now());
  expect(history.rows[0].events).toHaveLength(1);
  expect(history.rows[0].events[0].type).toBe("email.delivered");
  expect(JSON.stringify(history)).not.toContain(wallConfirmation(s.seed));
  expect(history.rows[0]).not.toHaveProperty("body");
});

it("records the actual provider send with a branded image and one-click unsubscribe headers", async () => {
  const { t, s } = await setup();
  await t.mutation(internal.wallSubscriptions.manage, {
    token: wallConfirmation(s.seed),
    action: "confirm",
  });
  await publish(t);
  await t.mutation(internal.wallSubscriptions.queue, {});
  vi.stubEnv("RESEND_API_KEY", "mock-key");
  const send = vi.fn(async () => Response.json({ id: "wall-provider-id" }));
  vi.stubGlobal("fetch", send);
  await deliverDue(t, "mail");
  expect(send).toHaveBeenCalledTimes(1);
  const request = send.mock.calls[0] as unknown as [string, { body: string }];
  const payload = JSON.parse(request[1].body);
  expect(payload.from).toContain("notifications@takethewall.com");
  expect(payload.headers["List-Unsubscribe-Post"]).toBe(
    "List-Unsubscribe=One-Click",
  );
  expect(payload.headers["List-Unsubscribe"]).toContain(
    "/api/wall-subscriptions/unsubscribe?token=",
  );
  expect(payload.html).toContain("/takeover/ttw_");
  expect(payload.text).toContain("Visit the live wall");
  const logs = await t.run((ctx) => ctx.db.query("emailHistory").collect());
  expect(logs.find((l) => l.kind === "wall_change")).toMatchObject({
    state: "accepted",
    providerId: "wall-provider-id",
  });
  expect(logs.find((l) => l.kind === "wall_confirm")?.state).toBe("skipped");
});
it("resumes directory backfill beyond the first batch without duplicating contacts", async () => {
  const { t } = await setup();
  await t.run(async (ctx) => {
    for (let i = 0; i < 65; i++)
      await ctx.db.insert("supportTickets", {
        name: "Person",
        email: `contact${i}@example.com`,
        topic: "support",
        message: "Hello",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  for (let i = 0; i < 4; i++)
    await t.mutation(internal.emailDirectory.reconcileSource, {
      source: "supportTickets",
    });
  expect(
    await t.run((ctx) => ctx.db.query("emailContacts").collect()),
  ).toHaveLength(66);
  await expect(
    t
      .withIdentity({
        subject: "outsider",
        email: "outsider@example.com",
        emailVerified: true,
      })
      .query(api.emailDirectory.list, {
        paginationOpts: { cursor: null, numItems: 25 },
      }),
  ).rejects.toThrow("Administrator");
  const admin = t.withIdentity({ subject: "admin-test" });
  const first = JSON.parse(
    await admin.query(api.emailDirectory.list, {
      paginationOpts: { cursor: null, numItems: 25 },
    }),
  );
  const second = JSON.parse(
    await admin.query(api.emailDirectory.list, {
      paginationOpts: { cursor: first.cursor, numItems: 25 },
    }),
  );
  expect(first.rows).toHaveLength(25);
  expect(second.rows).toHaveLength(25);
  expect(
    first.rows
      .map((r: { id: string }) => r.id)
      .filter((id: string) =>
        second.rows.some((r: { id: string }) => r.id === id),
      ),
  ).toEqual([]);
});
it("every-takeover catch-up continues beyond a full batch", async () => {
  const { t, s } = await setup();
  await t.mutation(internal.wallSubscriptions.manage, {
    token: wallConfirmation(s.seed),
    action: "confirm",
  });
  for (let i = 0; i < 23; i++) await publish(t, `Owner ${i}`);
  expect(await t.mutation(internal.wallSubscriptions.queue, {})).toBe(20);
  vi.advanceTimersByTime(60_001);
  expect(await t.mutation(internal.wallSubscriptions.queue, {})).toBe(3);
  vi.advanceTimersByTime(60_001);
  expect(await t.mutation(internal.wallSubscriptions.queue, {})).toBe(0);
});
