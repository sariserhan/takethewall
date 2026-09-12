// @vitest-environment node
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "../app/api/referrals/route";
import { backend } from "../lib/server";
import { readReferral } from "../lib/referral";
vi.mock("../lib/server", async (original) => ({
  ...(await original<typeof import("../lib/server")>()),
  backend: vi.fn(),
  rate: vi.fn(),
}));
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://takethewall.com");
  vi.stubEnv("WALL_TOKEN_SECRET", "x".repeat(40));
  vi.stubEnv("PUBLIC_METRICS_ENABLED", "true");
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.mocked(backend).mockReset();
  vi.mocked(backend).mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());
const id = "ttw_" + "a".repeat(32);
const request = (ua = "Mozilla/5.0", origin = "https://takethewall.com") =>
  new Request("https://takethewall.com/api/referrals", {
    method: "POST",
    headers: { origin, "user-agent": ua, "content-type": "application/json" },
    body: JSON.stringify({ publicId: id, visitorId: "browser-1234567890" }),
  });
it("sets a protected signed cookie only after an accepted visible-browser visit", async () => {
  const r = await POST(request());
  expect(r.status).toBe(204);
  const header = r.headers.get("set-cookie")!;
  expect(header).toContain("HttpOnly");
  expect(header).toContain("SameSite=lax");
  expect(header).toContain("Max-Age=2592000");
  const token = decodeURIComponent(
    header.split(";")[0].split("=").slice(1).join("="),
  );
  expect(readReferral(token)).toBe(id);
  expect(backend).toHaveBeenCalledWith("referralVisit", {
    publicId: id,
    visitorHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
});
it("does not count crawlers, cross-origin requests, test environments, or unavailable public pages", async () => {
  expect(
    (await POST(request("Googlebot"))).headers.get("set-cookie"),
  ).toBeNull();
  expect(backend).not.toHaveBeenCalled();
  expect(
    (await POST(request("Mozilla/5.0", "https://evil.example"))).status,
  ).toBe(403);
  vi.stubEnv("VERCEL_ENV", "preview");
  expect((await POST(request())).headers.get("set-cookie")).toBeNull();
  expect(backend).not.toHaveBeenCalled();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.mocked(backend).mockResolvedValue(false);
  expect((await POST(request())).headers.get("set-cookie")).toBeNull();
});
