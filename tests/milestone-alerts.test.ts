import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import { alertConfirmation, alertUnsubscribe } from "../lib/alert-secrets";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T09:00:00Z"));
  vi.stubEnv(
    "CLAIM_TOKEN_SECRET",
    "test-secret-for-alerts-at-least-32-characters",
  );
  vi.stubEnv("WALL_ENVIRONMENT", "production");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules);
  const logo = await t.run((ctx) => ctx.storage.store(new Blob(["logo"])));
  await t.mutation(internal.wall.seed, { logoStorageId: logo });
  await t.run(async (ctx) => {
    const site = (await ctx.db.query("siteStats").first())!;
    await ctx.db.patch(site._id, { totalTakeovers: 90 });
    await ctx.db.insert("rewardSettings", {
      key: "current",
      value: {
        milestones: [{ takeoverNumber: 100, rewardUsd: 100 }],
        initialDays: 7,
        additionalDays: 7,
        rulesVersion: "test",
        rulesJson: "{}",
        rewardsEnabled: true,
        payoutsEnabled: false,
        promotionEnabled: true,
      },
    });
  });
  return t;
}
it("alerts need consent and email confirmation, deduplicate, and cancel queued mail on unsubscribe", async () => {
  const t = await setup();
  const args = {
    email: "subscriber@example.com",
    ipHash: "ip",
    consent: true,
    honeypot: "",
  };
  await expect(
    t.mutation(internal.milestoneAlerts.subscribe, { ...args, consent: false }),
  ).rejects.toThrow("Confirm");
  await t.mutation(internal.milestoneAlerts.subscribe, args);
  const s = (await t.run((ctx) =>
    ctx.db.query("milestoneSubscribers").first(),
  ))!;
  expect(await t.mutation(internal.milestoneAlerts.queue, {})).toBe(0);
  const verification = (await t.run((ctx) =>
    ctx.db.query("transactionalMail").first(),
  ))!;
  const prepared = await t.mutation(internal.mail.prepare, {
    id: verification._id,
  });
  expect(prepared?.sender).toEqual({from:"Take The Wall — Milestone Alerts <alerts@takethewall.com>",reply_to:"support@takethewall.com"});
  expect(prepared?.presentation?.cta.url).toContain(alertConfirmation(s.seed));
  expect(
    await t.mutation(internal.milestoneAlerts.manage, {
      token: alertUnsubscribe(s.seed),
      action: "confirm",
    }),
  ).toBe(false);
  expect(
    await t.mutation(internal.milestoneAlerts.manage, {
      token: alertConfirmation(s.seed),
      action: "confirm",
    }),
  ).toBe(true);
  expect(await t.mutation(internal.milestoneAlerts.queue, {})).toBe(1);
  expect(await t.mutation(internal.milestoneAlerts.queue, {})).toBe(0);
  const alert = (
    await t.run((ctx) => ctx.db.query("transactionalMail").collect())
  ).find((j) => j.kind === "milestone_alert")!;
  expect(alert.body).toContain("10 counted takeovers");
  expect(alert.body).toContain("Numbers are not reserved");
  const payload = await t.mutation(internal.mail.prepare, { id: alert._id });
  expect(payload?.presentation?.unsubscribeUrl).toContain(
    alertUnsubscribe(s.seed),
  );
  await t.mutation(internal.milestoneAlerts.manage, {
    token: alertUnsubscribe(s.seed),
    action: "unsubscribe",
  });
  vi.advanceTimersByTime(61000);
  expect(await t.mutation(internal.mail.prepare, { id: alert._id })).toBeNull();
  expect(
    await t.mutation(internal.milestoneAlerts.manage, {
      token: alertConfirmation(s.seed),
      action: "confirm",
    }),
  ).toBe(false);
});
it("expired confirmation, inactive promotion, test deployment and passed milestones do not send alerts", async () => {
  const t = await setup();
  await t.mutation(internal.milestoneAlerts.subscribe, {
    email: "person@example.com",
    ipHash: "ip",
    consent: true,
    honeypot: "",
  });
  let s = (await t.run((ctx) => ctx.db.query("milestoneSubscribers").first()))!;
  vi.advanceTimersByTime(24 * 3600_000 + 1);
  expect(
    await t.mutation(internal.milestoneAlerts.manage, {
      token: alertConfirmation(s.seed),
      action: "confirm",
    }),
  ).toBe(false);
  await t.mutation(internal.milestoneAlerts.subscribe, {
    email: "person@example.com",
    ipHash: "ip",
    consent: true,
    honeypot: "",
  });
  s = (await t.run((ctx) => ctx.db.get(s._id)))!;
  await t.mutation(internal.milestoneAlerts.manage, {
    token: alertConfirmation(s.seed),
    action: "confirm",
  });
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  expect(await t.mutation(internal.milestoneAlerts.queue, {})).toBe(0);
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  const config = (await t.run((ctx) =>
    ctx.db.query("rewardSettings").first(),
  ))!;
  await t.run((ctx) =>
    ctx.db.patch(config._id, {
      value: { ...config.value, promotionEnabled: false },
    }),
  );
  expect(await t.mutation(internal.milestoneAlerts.queue, {})).toBe(0);
  await t.run((ctx) => ctx.db.patch(config._id, { value: config.value }));
  await t.mutation(internal.milestoneAlerts.queue, {});
  const alert = (
    await t.run((ctx) => ctx.db.query("transactionalMail").collect())
  ).find((j) => j.kind === "milestone_alert")!;
  await t.run(async (ctx) => {
    const site = (await ctx.db.query("siteStats").first())!;
    await ctx.db.patch(site._id, { totalTakeovers: 100 });
  });
  expect(await t.mutation(internal.mail.prepare, { id: alert._id })).toBeNull();
});
