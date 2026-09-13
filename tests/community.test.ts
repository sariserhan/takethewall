import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { parseTakeCommand } from "../lib/terminal-command";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
  vi.stubEnv("ADMIN_USER_IDS", "admin");
  vi.stubEnv("WALL_ENVIRONMENT", "production");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function setup() {
  const t = convexTest(schema, modules),
    admin = t.withIdentity({ subject: "admin" });
  const publish = async (n: number) =>
    admin.mutation(api.admin.publish, {
      contentType: "personal",
      displayName: `Owner ${n}`,
      websiteUrl: "",
      description: "A public project",
      recipientEmail: `owner${n}@example.com`,
      countTowardMilestones: true,
      reason: "Community test",
      requestKey: String(n),
      expectedCurrentId:
        (await t.query(api.wall.current, {}))?.owner.id ?? null,
    });
  return { t, admin, publish };
}
it("protects controls and respects both history switches without duplicate rows as the wall changes", async () => {
  const { t, admin, publish } = setup();
  expect(await t.query(api.community.history, {})).toBeNull();
  await expect(
    t.mutation(api.community.configure, {
      feature: "crumblingEnabled",
      enabled: true,
    }),
  ).rejects.toThrow("Administrator");
  for (let i = 0; i < 12; i++) {
    await publish(i);
    vi.setSystemTime(Date.now() + 1000);
  }
  await admin.mutation(api.community.configure, {
    feature: "crumblingEnabled",
    enabled: true,
  });
  expect(
    (await t.query(api.community.history, { limit: 10 }))?.entries,
  ).toHaveLength(9);
  const more = await t.query(api.community.history, { limit: 20 });
  expect(more?.entries).toHaveLength(11);
  expect(new Set(more?.entries.map((e) => e.publicId)).size).toBe(11);
  await publish(13);
  expect(
    (await t.query(api.community.history, { limit: 20 }))?.entries,
  ).toHaveLength(12);
  await admin.mutation(api.growth.setHistoryVisibility, { enabled: false });
  expect(await t.query(api.community.history, {})).toBeNull();
  await admin.mutation(api.growth.setHistoryVisibility, { enabled: true });
  await admin.mutation(api.community.configure, {
    feature: "crumblingEnabled",
    enabled: false,
  });
  expect(await t.query(api.community.history, {})).toBeNull();
});
it("creates idempotent draft issues, requires review, rejects stale edits, and removes moderated sources", async () => {
  const { t, admin, publish } = setup();
  await publish(1);
  await publish(2);
  await expect(t.query(api.community.issues, {})).rejects.toThrow(
    "Administrator",
  );
  await expect(
    admin.mutation(api.community.createDraft, { date: "2026-09-12" }),
  ).rejects.toThrow("completed UTC");
  vi.setSystemTime(new Date("2026-09-13T00:05:00Z"));
  const id = await admin.mutation(api.community.createDraft, {
    date: "2026-09-12",
  });
  expect(
    await admin.mutation(api.community.createDraft, { date: "2026-09-12" }),
  ).toBe(id);
  await admin.mutation(api.community.configure, {
    feature: "gazetteEnabled",
    enabled: true,
  });
  expect(await t.query(api.community.gazette, {})).toBeNull();
  const issue = (await admin.query(api.community.issues, {}))[0];
  expect(issue.entries).toHaveLength(2);
  await expect(
    t.mutation(api.community.review, {
      id,
      headline: "Headline",
      body: "Story",
      publish: true,
      revision: 0,
    }),
  ).rejects.toThrow("Administrator");
  await admin.mutation(api.community.review, {
    id,
    headline: "Projects on the wall",
    body: "Explore yesterday's projects.",
    publish: true,
    revision: 0,
  });
  expect((await t.query(api.community.gazette, {}))?.headline).toBe(
    "Projects on the wall",
  );
  await expect(
    admin.mutation(api.community.review, {
      id,
      headline: "Stale",
      body: "Stale",
      publish: true,
      revision: 0,
    }),
  ).rejects.toThrow("changed");
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("takeovers")
      .withIndex("by_publicId", (q) =>
        q.eq("publicTakeoverId", issue.entries[0].publicId),
      )
      .unique();
    await ctx.db.patch(row!._id, { blocked: true });
  });
  expect((await t.query(api.community.gazette, {}))?.entries).toHaveLength(1);
  await admin.mutation(api.community.review, {
    id,
    headline: "Projects",
    body: "Withdrawing for review",
    publish: false,
    revision: 1,
  });
  expect(await t.query(api.community.gazette, {})).toBeNull();
});
it("automatic Gazette generation is opt-in, draft-only, and empty issues cannot be published", async () => {
  const { t, admin } = setup();
  vi.setSystemTime(new Date("2026-09-13T00:05:00Z"));
  await t.mutation(internal.community.midnight, {});
  expect(await admin.query(api.community.issues, {})).toHaveLength(0);
  await admin.mutation(api.community.configure, {
    feature: "gazetteAuto",
    enabled: true,
  });
  await t.mutation(internal.community.midnight, {});
  await t.mutation(internal.community.midnight, {});
  const issues = await admin.query(api.community.issues, {});
  expect(issues).toHaveLength(1);
  expect(issues[0].status).toBe("draft");
  await expect(
    admin.mutation(api.community.review, {
      id: issues[0].id,
      headline: "Empty",
      body: "Empty",
      publish: true,
      revision: 0,
    }),
  ).rejects.toThrow("eligible");
});
it("validates event schedule and requires an administrator", async () => {
  const { t, admin } = setup();
  const event = {
    enabled: true,
    title: "Friday Wall Hour",
    description: "Meet the makers",
    start: Date.now(),
    end: Date.now() + 3600000,
  };
  await expect(
    t.mutation(api.community.scheduleEvent, { event }),
  ).rejects.toThrow("Administrator");
  await expect(
    admin.mutation(api.community.scheduleEvent, {
      event: { ...event, end: event.start },
    }),
  ).rejects.toThrow("valid event");
  await admin.mutation(api.community.scheduleEvent, { event });
  expect((await t.query(api.community.controls, {})).event).toEqual(event);
  await admin.mutation(api.community.scheduleEvent, {
    event: { ...event, enabled: false },
  });
  expect((await t.query(api.community.controls, {})).event?.enabled).toBe(
    false,
  );
});
it("terminal only parses reviewable drafts and rejects scripts, credentials and arbitrary commands", () => {
  expect(
    parseTakeCommand(
      'take --title "My SaaS" --url "https://example.com" --pay',
    ),
  ).toEqual({ displayName: "My SaaS", websiteUrl: "https://example.com/" });
  expect(parseTakeCommand('take --title "Hello"')).toEqual({
    displayName: "Hello",
    websiteUrl: "",
  });
  for (const command of [
    'take --title "Bad" --url "javascript:alert(1)"',
    'take --title "Bad" --url "https://user:secret@example.com"',
    'take --title "Bad"; rm -rf /',
    'eval("alert(1)")',
    'take --title " "',
  ])
    expect(() => parseTakeCommand(command)).toThrow();
});
