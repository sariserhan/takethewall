// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Webhook } from "svix";
import { POST } from "../app/api/webhooks/resend/route";
const { backend } = vi.hoisted(() => ({ backend: vi.fn() }));
vi.mock("../lib/server", async (original) => ({
  ...(await original<typeof import("../lib/server")>()),
  backend,
}));
const secret =
  "whsec_" +
  Buffer.from("test-webhook-secret-not-production").toString("base64");
beforeEach(() => {
  vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  backend.mockReset();
  backend.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
function request(type = "email.delivered", date = new Date(), tamper = false) {
  const payload = JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: {
      email_id: "email-test",
      to: ["private@example.com"],
      subject: "Private subject",
    },
  });
  const id = "msg_test";
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: {
      "svix-id": id,
      "svix-timestamp": String(Math.floor(date.getTime() / 1000)),
      "svix-signature": new Webhook(secret).sign(id, date, payload),
    },
    body: tamper ? payload + " " : payload,
  });
}
it("verifies the raw signature and projects only non-content delivery fields", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(backend).toHaveBeenCalledWith("emailDelivery", {
    eventId: "msg_test",
    emailId: "email-test",
    type: "email.delivered",
    occurredAt: expect.any(Number),
  });
});
it("rejects missing, modified and stale signatures without writes", async () => {
  expect(
    (
      await POST(
        new Request("http://localhost", { method: "POST", body: "{}" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await POST(request("email.delivered", new Date(), true))).status,
  ).toBe(400);
  expect(
    (await POST(request("email.delivered", new Date(Date.now() - 600000))))
      .status,
  ).toBe(400);
  expect(backend).not.toHaveBeenCalled();
});
it("does not store inbound email content", async () => {
  expect((await POST(request("email.received"))).status).toBe(200);
  expect(backend).not.toHaveBeenCalled();
});
it("returns retryable failure if persistence is unavailable", async () => {
  backend.mockRejectedValueOnce(new Error("unavailable"));
  expect((await POST(request())).status).toBe(500);
});
