import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { ownerToken } from "../lib/owner-secrets";
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
it("counts one changeable vote and leaves price, ownership and analytics unchanged", async () => {
  const { t, id } = await setup();
  const before = await t.query(api.wall.current, {});
  const checkout = await t.query(api.checkoutControls.state, {});
  const args = { takeoverId: id, voterHash: "a".repeat(64), ipHash: "network" };
  await t.mutation(internal.wallVotes.cast, { ...args, choice: "keep" });
  await t.mutation(internal.wallVotes.cast, { ...args, choice: "keep" });
  expect(await t.query(api.wallVotes.totals, { takeoverId: id })).toEqual({
    keep: 1,
    yeet: 0,
  });
  await t.mutation(internal.wallVotes.cast, { ...args, choice: "yeet" });
  expect(await t.query(api.wallVotes.totals, { takeoverId: id })).toEqual({
    keep: 0,
    yeet: 1,
  });
  expect(
    await t.query(internal.wallVotes.mine, {
      takeoverId: id,
      voterHash: args.voterHash,
    }),
  ).toBe("yeet");
  expect(await t.query(api.wall.current, {})).toEqual(before);
  expect(await t.query(api.checkoutControls.state, {})).toEqual(checkout);
});
it("starts fresh for a new owner and rejects stale or moderated targets", async () => {
  const { t, id, publish } = await setup();
  await t.mutation(internal.wallVotes.cast, {
    takeoverId: id,
    voterHash: "a".repeat(64),
    ipHash: "network",
    choice: "keep",
  });
  const next = await publish("second");
  expect(await t.query(api.wallVotes.totals, { takeoverId: id })).toBeNull();
  expect(await t.query(api.wallVotes.totals, { takeoverId: next })).toEqual({
    keep: 0,
    yeet: 0,
  });
  await expect(
    t.mutation(internal.wallVotes.cast, {
      takeoverId: id,
      voterHash: "b".repeat(64),
      ipHash: "network",
      choice: "yeet",
    }),
  ).rejects.toThrow("changed");
  await t.run((ctx) => ctx.db.patch(next, { blocked: true }));
  expect(await t.query(api.wallVotes.totals, { takeoverId: next })).toBeNull();
});
it("aggregates shards and rate-limits attempts to create many votes on one network", async () => {
  const { t, id } = await setup();
  for (let n = 0; n < 20; n++)
    await t.mutation(internal.wallVotes.cast, {
      takeoverId: id,
      voterHash: n.toString(16).padStart(2, "0") + "a".repeat(62),
      ipHash: "network",
      choice: n % 2 ? "keep" : "yeet",
    });
  expect(await t.query(api.wallVotes.totals, { takeoverId: id })).toEqual({
    keep: 10,
    yeet: 10,
  });
  await expect(
    t.mutation(internal.wallVotes.cast, {
      takeoverId: id,
      voterHash: "f".repeat(64),
      ipHash: "network",
      choice: "keep",
    }),
  ).rejects.toThrow("Too many");
  expect(await t.query(api.wallVotes.totals, { takeoverId: id })).toEqual({
    keep: 10,
    yeet: 10,
  });
});
