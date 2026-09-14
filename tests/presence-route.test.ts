// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ backend: vi.fn(), rate: vi.fn() }));
vi.mock("../lib/server", async original => ({
  ...(await original<typeof import("../lib/server")>()), backend: mocks.backend, rate: mocks.rate,
}));
import { signContext } from "../lib/server";
import { POST } from "../app/api/presence/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WALL_TOKEN_SECRET", "x".repeat(40));
  mocks.backend.mockResolvedValue({ sessionToken: "session-secret" });
});
afterEach(() => vi.unstubAllEnvs());
const signed = (excluded = false, expiresAt = Date.now() + 300_000) => signContext({
  takeoverId: "takeover", visitorHash: "verified-browser", pageId: "verified-page",
  city: "Sydney", region: "AU", issuedAt: Date.now(), expiresAt, excluded,
});
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/presence", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
it("takes identity and location exclusively from the signed context", async () => {
  const response = await POST(request({ action: "heartbeat", sessionId: "visibility-session", token: signed(), visitorHash: "spoof", city: "spoof" }));
  expect(response.status).toBe(200);
  expect(mocks.backend).toHaveBeenCalledWith("presenceHeartbeat", { visitorHash: "verified-browser", pageId: "verified-page:visibility-session", city: "Sydney", country: "AU" });
});
it("rejects forged or expired credentials and foreign origins", async () => {
  for (const token of ["forged", signed(false, Date.now() - 1)]) {
    expect((await POST(request({ action: "heartbeat", sessionId: "visibility-session", token }))).status).toBe(400);
  }
  expect((await POST(request({ action: "heartbeat", sessionId: "visibility-session", token: signed() }, "https://evil.com"))).status).toBe(403);
  expect(mocks.backend).not.toHaveBeenCalled();
});
it("excludes test and bot traffic", async () => {
  const response = await POST(request({ action: "heartbeat", sessionId: "visibility-session", token: signed(true) }));
  expect(await response.json()).toEqual({ sessionToken: null });
  expect(mocks.backend).not.toHaveBeenCalled();
});
it("permits disconnect only by its session capability", async () => {
  expect((await POST(request({ action: "disconnect", sessionToken: "own-session-capability" }))).status).toBe(204);
  expect(mocks.backend).toHaveBeenCalledWith("presenceDisconnect", { sessionToken: "own-session-capability" });
});
