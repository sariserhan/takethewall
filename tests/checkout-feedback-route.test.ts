// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ backend: vi.fn() }));
vi.mock("../lib/server", async original => ({ ...(await original<typeof import("../lib/server")>()), backend: mocks.backend, clientHash: () => "hashed-ip" }));
import { POST } from "../app/api/checkout/feedback/route";
beforeEach(() => vi.clearAllMocks());
function req(body: unknown, origin = "http://localhost:4000") { return new Request("http://localhost:4000/api/checkout/feedback", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
const body = { reason: "Just exploring", stage: "preview", details: "" };
it("forwards only feedback fields, never the draft or email", async () => {
  expect((await POST(req({ ...body, buyerEmail: "private@example.com", canvasDesign: "private draft" }))).status).toBe(200);
  expect(mocks.backend).toHaveBeenCalledWith("checkoutFeedback", { ...body, honeypot: "", ipHash: "hashed-ip" });
});
it("rejects cross-origin and malformed requests before backend writes", async () => {
  expect((await POST(req(body, "https://evil.example"))).status).toBe(403);
  for (const invalid of [{ ...body, reason: "invalid" }, { ...body, stage: "paid" }, { ...body, details: "x".repeat(501) }]) expect((await POST(req(invalid))).status).toBe(400);
  expect(mocks.backend).not.toHaveBeenCalled();
});
