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
it("keeps questions private until answered and closes the AMA on replacement", async () => {
  const { t, id, token, publish } = await setup();
  expect(await t.query(api.ama.current, { takeoverId: id })).toBeNull();
  await t.mutation(internal.ama.manage, { token, enabled: true });
  await t.mutation(internal.ama.ask, {
    takeoverId: id,
    question: "What did you build?",
    ipHash: "visitor-one",
    honeypot: "",
  });
  expect(
    (await t.query(api.ama.current, { takeoverId: id }))?.answers,
  ).toHaveLength(0);
  const inbox = await t.query(internal.ama.inbox, { token });
  expect(inbox.pending).toHaveLength(1);
  await t.mutation(internal.ama.manage, {
    token,
    questionId: inbox.pending[0].id,
    answer: "A useful app.",
  });
  expect(
    (await t.query(api.ama.current, { takeoverId: id }))?.answers[0].answer,
  ).toBe("A useful app.");
  await publish("second");
  expect(await t.query(api.ama.current, { takeoverId: id })).toBeNull();
  await expect(
    t.mutation(internal.ama.ask, {
      takeoverId: id,
      question: "Still here?",
      ipHash: "visitor-two",
      honeypot: "",
    }),
  ).rejects.toThrow("closed");
  await expect(
    t.mutation(internal.ama.manage, { token, enabled: true }),
  ).rejects.toThrow("ended");
});
it("rejects another owner's token, limits spam, and supports removing published answers", async () => {
  const { t, id, token, publish } = await setup();
  await t.mutation(internal.ama.manage, { token, enabled: true });
  for (let n = 0; n < 3; n++)
    await t.mutation(internal.ama.ask, {
      takeoverId: id,
      question: "Question " + n,
      ipHash: "one-browser",
      honeypot: "",
    });
  await expect(
    t.mutation(internal.ama.ask, {
      takeoverId: id,
      question: "Too many?",
      ipHash: "one-browser",
      honeypot: "",
    }),
  ).rejects.toThrow("Too many");
  const q = (await t.query(internal.ama.inbox, { token })).pending[0];
  await t.mutation(internal.ama.manage, {
    token,
    questionId: q.id,
    answer: "A public reply",
  });
  await t.mutation(internal.ama.manage, {
    token,
    questionId: q.id,
    dismiss: true,
  });
  expect(
    (await t.query(api.ama.current, { takeoverId: id }))?.answers,
  ).toHaveLength(0);
  const second = await publish("second");
  await t.mutation(internal.owners.ensureAccess, { takeoverId: second });
  const access = await t.run((ctx) =>
    ctx.db
      .query("ownerAccess")
      .withIndex("by_takeover", (q) => q.eq("takeoverId", second))
      .unique(),
  );
  await expect(
    t.mutation(internal.ama.manage, {
      token: ownerToken(access!.seed),
      questionId: q.id,
      dismiss: true,
    }),
  ).rejects.toThrow("unavailable");
  await expect(
    t.query(internal.ama.inbox, { token: "a".repeat(64) }),
  ).rejects.toThrow("Invalid");
});
it("hides answers when the owner disables the AMA or moderation blocks the placement", async () => {
  const { t, id, token } = await setup();
  await t.mutation(internal.ama.manage, { token, enabled: true });
  await t.mutation(internal.ama.ask, {
    takeoverId: id,
    question: "A real question?",
    ipHash: "visitor",
    honeypot: "bot",
  });
  expect((await t.query(internal.ama.inbox, { token })).pending).toHaveLength(
    0,
  );
  await t.mutation(internal.ama.manage, { token, enabled: false });
  expect(await t.query(api.ama.current, { takeoverId: id })).toBeNull();
  await t.mutation(internal.ama.manage, { token, enabled: true });
  await t.run((ctx) => ctx.db.patch(id, { blocked: true }));
  expect(await t.query(api.ama.current, { takeoverId: id })).toBeNull();
});
