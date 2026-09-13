import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules);
  const logo = await t.run((ctx) => ctx.storage.store(new Blob(["logo"])));
  await t.mutation(internal.wall.seed, { logoStorageId: logo });
  const id = (await t.query(api.wall.current, {}))!.owner.id;
  return { t, id };
}
it("rate limits anonymous comments and prevents unauthorised moderation", async () => {
  const { t, id } = await setup();
  const post = (text: string) =>
    t.mutation(internal.whispers.post, {
      takeoverId: id,
      text,
      ipHash: "visitor",
      honeypot: "",
    });
  await expect(post("a".repeat(51))).rejects.toThrow();
  await post("Hello wall!");
  await post("Who is next?");
  await post("Nice project.");
  await expect(post("Spam")).rejects.toThrow();
  const rows = await t.query(api.whispers.messages, { takeoverId: id });
  expect(rows).toHaveLength(3);
  expect(rows[0]).not.toHaveProperty("ipHash");
  await expect(
    t.mutation(api.whispers.remove, { id: rows[0].id }),
  ).rejects.toThrow();
  const admin = t.withIdentity({
    subject: "admin",
    email: "admin@example.com",
    emailVerified: true,
  });
  await admin.mutation(api.whispers.remove, { id: rows[0].id });
  expect(await t.query(api.whispers.messages, { takeoverId: id })).toHaveLength(
    2,
  );
  vi.setSystemTime(Date.now() + 30 * 86400_000);
  await t.mutation(internal.whispers.cleanup, {});
  expect(await t.query(api.whispers.messages, { takeoverId: id })).toHaveLength(
    2,
  );
  const next = await t.run(async (ctx) => {
    const { _id, _creationTime, ...owner } = (await ctx.db.get(id))!;
    void _id;
    void _creationTime;
    const newId = await ctx.db.insert("takeovers", {
      ...owner,
      displayName: "Next owner",
    });
    const site = (await ctx.db
      .query("siteStats")
      .withIndex("by_key", (q) => q.eq("key", "wall"))
      .unique())!;
    await ctx.db.patch(site._id, { currentTakeoverId: newId });
    return newId;
  });
  expect(await t.query(api.whispers.messages, { takeoverId: id })).toEqual([]);
  await t.mutation(internal.whispers.post, {
    takeoverId: next,
    text: "New room",
    ipHash: "new",
    honeypot: "",
  });
  await t.mutation(internal.whispers.cleanup, {});
  expect(await t.run((ctx) => ctx.db.get(rows[1].id))).toBeNull();
  expect(
    await t.query(api.whispers.messages, { takeoverId: next }),
  ).toHaveLength(1);
});
it("rejects comments on blocked owners and ignores honeypots", async () => {
  const { t, id } = await setup();
  await t.mutation(internal.whispers.post, {
    takeoverId: id,
    text: "Bot",
    ipHash: "bot",
    honeypot: "filled",
  });
  expect(await t.query(api.whispers.messages, { takeoverId: id })).toHaveLength(
    0,
  );
  await t.run((ctx) => ctx.db.patch(id, { blocked: true }));
  await expect(
    t.mutation(internal.whispers.post, {
      takeoverId: id,
      text: "Hi",
      ipHash: "human",
      honeypot: "",
    }),
  ).rejects.toThrow();
  expect(await t.query(api.auditTrail.current, {})).toBeNull();
});

it("paginates the full current reign without dropping older messages", async () => {
  const { t, id } = await setup();
  await t.run(async (ctx) => {
    for (let i = 0; i < 65; i++)
      await ctx.db.insert("whispers", {
        takeoverId: id,
        text: `Message ${i}`,
        hidden: false,
        createdAt: Date.now(),
      });
  });
  const first = await t.query(api.whispers.history, {
    takeoverId: id,
    paginationOpts: { numItems: 50, cursor: null },
  });
  expect(first.page).toHaveLength(50);
  expect(first.isDone).toBe(false);
  const second = await t.query(api.whispers.history, {
    takeoverId: id,
    paginationOpts: { numItems: 50, cursor: first.continueCursor },
  });
  expect(second.page).toHaveLength(15);
  expect(second.isDone).toBe(true);
  expect(new Set([...first.page, ...second.page].map((r) => r.id)).size).toBe(
    65,
  );
});
