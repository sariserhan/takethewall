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
  vi.setSystemTime(Date.now() + 11 * 60_000);
  await t.mutation(internal.whispers.cleanup, {});
  expect(await t.query(api.whispers.messages, { takeoverId: id })).toHaveLength(
    0,
  );
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
