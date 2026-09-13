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
it("batches unanswered questions into one branded private owner email", async () => {
  const { t, id, token } = await setup();
  await t.mutation(internal.ama.manage, { token, enabled: true });
  const since = Date.now();
  for (const ipHash of ["a", "b"]) await t.mutation(internal.ama.ask, { takeoverId: id, question: "What is next?", ipHash, honeypot: "" });
  const takeover = await t.run(ctx => ctx.db.get(id));
  expect(takeover?.amaBatchSince).toBe(since);
  await t.mutation(internal.ama.notify, { takeoverId: id, since });
  await t.mutation(internal.ama.notify, { takeoverId: id, since });
  const job = await t.run(ctx => ctx.db.query("transactionalMail").withIndex("by_key", q => q.eq("key", `ama:${id}:${since}`)).unique());
  expect(job?.to).toBe("first@example.com");
  expect(job?.body).toContain("2 new questions");
  expect(job?.body).not.toContain(token);
  const prepared = await t.mutation(internal.mail.prepare, { id: job!._id });
  expect(prepared?.sender.from).toContain("notifications@takethewall.com");
  expect(prepared?.presentation?.cta.url).toContain("/owner#token=" + token);
  expect(prepared?.presentation?.cta.label).toBe("Review and answer questions");
  await t.mutation(internal.ama.manage, { token, enabled: false });
  vi.setSystemTime(Date.now() + 61_000);
  expect(await t.mutation(internal.mail.prepare, { id: job!._id })).toBeNull();
});
it("skips notifications for handled questions and replaced owners", async () => {
  const { t, id, token, publish } = await setup();
  await t.mutation(internal.ama.manage, { token, enabled: true });
  const ask = () => t.mutation(internal.ama.ask, { takeoverId: id, question: "What is next?", ipHash: "a", honeypot: "" });
  await ask();
  const since = Date.now();
  const inbox = await t.query(internal.ama.inbox, { token });
  await t.mutation(internal.ama.manage, { token, questionId: inbox.pending[0].id, dismiss: true });
  await t.mutation(internal.ama.notify, { takeoverId: id, since });
  expect(await t.run(ctx => ctx.db.query("transactionalMail").withIndex("by_key", q => q.eq("key", `ama:${id}:${since}`)).unique())).toBeNull();
  vi.setSystemTime(Date.now() + 300_000);
  await ask();
  const next = Date.now();
  await publish("second");
  await t.mutation(internal.ama.notify, { takeoverId: id, since: next });
  expect(await t.run(ctx => ctx.db.query("transactionalMail").withIndex("by_key", q => q.eq("key", `ama:${id}:${next}`)).unique())).toBeNull();
});

it.each([undefined, false, true])("preserves checkout AMA opt-in %s and opens it only after paid activation", async (enabled) => {
  const { t } = await setup();
  const pending = await t.mutation(internal.purchases.pending, {
    requestKey: "ama-checkout", fingerprint: "ama-checkout", tokenHash: "confirmation",
    ownerHash: "buyer", uploadKey: "", contentType: "personal", displayName: "New owner",
    websiteUrl: "", description: "Ask me about my project", buyerEmail: "buyer@example.com", environment: "test",
    ...(enabled === undefined ? {} : { amaEnabled: enabled }),
  });
  expect((await t.run(ctx => ctx.db.get(pending.takeoverId)))?.amaEnabled).toBe(enabled ?? false);
  expect(await t.query(api.ama.current, {takeoverId:pending.takeoverId})).toBeNull();
  await t.mutation(internal.purchases.activate, {takeoverId:pending.takeoverId,eventId:"evt_ama",sessionId:"cs_ama",paymentIntentId:"pi_ama",amountCents:499,currency:"usd",paid:true,livemode:false});
  expect(await t.query(api.ama.current, {takeoverId:pending.takeoverId})).toEqual(enabled ? {answers:[]} : null);
});
