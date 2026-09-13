// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  backend: vi.fn(),
  rate: vi.fn(),
  pulse: vi.fn(),
}));
vi.mock("../lib/server", async (original) => ({
  ...(await original<typeof import("../lib/server")>()),
  backend: mocks.backend,
  rate: mocks.rate,
}));
vi.mock("../lib/site-pulse", () => ({ sitePulse: mocks.pulse }));
import { POST } from "../app/api/pulse/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.backend.mockImplementation(async (op) =>
    op === "context"
      ? { id: "current", websiteUrl: "https://actual-owner.com" }
      : null,
  );
  mocks.pulse.mockResolvedValue({ status: 200 });
});
function req(
  origin = "http://localhost:4000",
  body: unknown = { takeoverId: "current", url: "https://attacker.com" },
) {
  return new Request("http://localhost:4000/api/pulse", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
it("checks only the server-resolved current owner and reuses results", async () => {
  expect((await POST(req())).status).toBe(200);
  expect(mocks.pulse).toHaveBeenCalledWith("https://actual-owner.com");
  expect((await POST(req())).status).toBe(200);
  expect(mocks.pulse).toHaveBeenCalledTimes(1);
  expect(mocks.rate).toHaveBeenCalledTimes(2);
});
it("rejects foreign origins before doing work", async () => {
  expect((await POST(req("https://evil.com"))).status).toBe(403);
  expect(mocks.backend).not.toHaveBeenCalled();
});
it("does not check replaced owners", async () => {
  mocks.backend.mockRejectedValue(new Error("The wall changed"));
  expect((await POST(req())).status).toBe(400);
  expect(mocks.pulse).not.toHaveBeenCalled();
});
