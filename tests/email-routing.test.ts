import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { senderForMail } from "../lib/email-routing";
import { transactionalEmail } from "../lib/transactional-email";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("RESEND_FROM", "Legacy <contact@takethewall.com>");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each([
  ["General question", "contact"],
  ["Business inquiry", "contact"],
  ["Milestone reward", "rewards"],
  ["Payment issue", "support"],
  ["Report content", "support"],
])(
  "%s replies are delivered through the correct mailbox",
  async (topic, address) => {
    const t = convexTest(schema, modules),
      admin = t.withIdentity({
        subject: "admin",
        email: "admin@example.com",
        emailVerified: true,
      });
    const ticketId = await t.run((ctx) =>
      ctx.db.insert("supportTickets", {
        name: "Owner",
        email: "owner@example.com",
        topic,
        message: "Help",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await admin.mutation(api.admin.supportAction, {
      id: ticketId,
      reply: "Your requested update.",
    });
    const mail = (await t.run((ctx) =>
      ctx.db.query("transactionalMail").first(),
    ))!;
    const prepared = (await t.mutation(internal.mail.prepare, {
      id: mail._id,
    }))!;
    const send = vi.fn().mockResolvedValue(Response.json({ id: "email" }));
    vi.stubGlobal("fetch", send);
    await transactionalEmail.send(prepared);
    const payload = JSON.parse(send.mock.calls[0][1].body);
    expect(payload.from).toContain(`<${address}@takethewall.com>`);
    expect(payload.reply_to).toBe(`${address}@takethewall.com`);
    expect(payload.to).toEqual(["owner@example.com"]);
    expect(payload.text).toContain("Your requested update.");
    expect(send.mock.calls[0][1].headers["Idempotency-Key"]).toBe(mail.key);
  },
);
it("reward notices use rewards, while authentication and private access use account", () => {
  for (const kind of [
    "claim_link",
    "reminder",
    "chat",
    "approved",
    "paid",
    "ineligible",
  ]) {
    expect(senderForMail({ kind, claimId: "claim" })).toMatchObject({
      from: "Take The Wall — Rewards <rewards@takethewall.com>",
      reply_to: "rewards@takethewall.com",
    });
  }
  for (const kind of ["otp", "admin_otp", "owner_access_email"]) {
    expect(senderForMail({ kind, claimId: "claim" }).from).toContain(
      "<account@takethewall.com>",
    );
  }
});
it.each([0, 1])(
  "transactional retry pins headers across environment changes (prior attempts %i)",
  async (attempts) => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) =>
      ctx.db.insert("transactionalMail", {
        key: "stable",
        kind: "support",
        to: "owner@example.com",
        subject: "Support",
        body: "Your reply",
        state: "pending",
        attempts,
        nextAt: 0,
        createdAt: Date.now(),
      }),
    );
    const first = (await t.mutation(internal.mail.prepare, { id }))!;
    expect(first.sender.from).toBe(
      attempts
        ? "Legacy <contact@takethewall.com>"
        : "Take The Wall — Support <support@takethewall.com>",
    );
    vi.stubEnv("RESEND_FROM", "Different <other@example.com>");
    vi.stubEnv("SUPPORT_EMAIL", "changed@example.com");
    await t.run((ctx) => ctx.db.patch(id, { state: "failed" }));
    const admin = t.withIdentity({
      subject: "admin",
      email: "admin@example.com",
      emailVerified: true,
    });
    await admin.mutation(api.deliveryAdmin.retry, { queue: "mail", id });
    expect(await t.mutation(internal.mail.prepare, { id })).toEqual(first);
  },
);
it("legacy owner-job manual replay preserves its sender and absent Reply-To", async () => {
  const t = convexTest(schema, modules);
  const logoStorageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["logo"])),
  );
  const takeoverId = await t.mutation(internal.wall.seed, { logoStorageId });
  const id = await t.run((ctx) =>
    ctx.db.insert("jobs", {
      key: "owner-stable",
      kind: "owner_access_email",
      takeoverId,
      deliveryId: "stable",
      timestamp: Date.now(),
      state: "failed",
      attempts: 12,
      nextAt: 0,
    }),
  );
  const admin = t.withIdentity({
    subject: "admin",
    email: "admin@example.com",
    emailVerified: true,
  });
  await admin.mutation(api.deliveryAdmin.retry, { queue: "jobs", id });
  expect((await t.run((ctx) => ctx.db.get(id)))?.sender).toEqual({
    from: "Legacy <contact@takethewall.com>",
  });
  vi.stubEnv("RESEND_FROM", "New <other@example.com>");
  await t.mutation(internal.jobs.claim, { id });
  expect((await t.run((ctx) => ctx.db.get(id)))?.sender).toEqual({
    from: "Legacy <contact@takethewall.com>",
  });
});
