// @vitest-environment node
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "../app/api/referrals/route";
import { backend } from "../lib/server";
import { readReferral } from "../lib/referral";
import {
  REFERRAL_BROWSER_COOKIE,
  readReferralBrowser,
} from "../lib/referral-proof";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { value: jar.get(name) } : undefined,
  }),
}));
vi.mock("../lib/server", async (original) => ({
  ...(await original<typeof import("../lib/server")>()),
  backend: vi.fn(),
  rate: vi.fn(),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1700000000000);
  jar.clear();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://takethewall.com");
  vi.stubEnv("WALL_TOKEN_SECRET", "x".repeat(40));
  vi.stubEnv("PUBLIC_METRICS_ENABLED", "true");
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.mocked(backend).mockReset();
  vi.mocked(backend).mockResolvedValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const id = "ttw_" + "a".repeat(32);
const request = (
  body: unknown = {
    action: "begin",
    publicId: id,
    visitorId: "browser-1234567890",
  },
  ua = "Mozilla/5.0",
  origin = "https://takethewall.com",
) =>
  new Request("https://takethewall.com/api/referrals", {
    method: "POST",
    headers: { origin, "user-agent": ua, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
function cookie(r: Response) {
  return decodeURIComponent(
    r.headers.get("set-cookie")!.split(";")[0].split("=").slice(1).join("="),
  );
}
async function begin() {
  const r = await POST(request());
  expect(r.status).toBe(200);
  jar.set(REFERRAL_BROWSER_COOKIE, cookie(r));
  return (await r.json()).proof;
}
it("requires a signed browser cookie and a completed waiting period before counting", async () => {
  const proof = await begin();
  expect(backend).not.toHaveBeenCalledWith("referralVisit", expect.anything());
  const body = { action: "complete", publicId: id, proof };
  expect((await POST(request(body))).status).toBe(403);
  vi.setSystemTime(Date.now() + 5100);
  const r = await POST(request(body));
  expect(r.status).toBe(204);
  expect(readReferral(cookie(r))).toBe(id);
  expect(backend).toHaveBeenCalledWith("referralVisit", {
    publicId: id,
    visitorHash: readReferralBrowser(jar.get(REFERRAL_BROWSER_COOKIE)),
  });
  expect(r.headers.get("set-cookie")).toContain("HttpOnly");
});
it("pins browser identity across localStorage changes and rejects tampering and missing proof", async () => {
  const proof = await begin(),
    original = jar.get(REFERRAL_BROWSER_COOKIE);
  const r = await POST(
    request({
      action: "begin",
      publicId: id,
      visitorId: "a-new-browser-id-123",
    }),
  );
  expect(cookie(r)).toBe(original);
  vi.setSystemTime(Date.now() + 5100);
  expect(
    (
      await POST(
        request({ action: "complete", publicId: id, proof: proof + "x" }),
      )
    ).status,
  ).toBe(403);
  expect(
    (await POST(request({ publicId: id, visitorId: "browser-1234567890" })))
      .status,
  ).toBe(403);
  jar.clear();
  expect(
    (await POST(request({ action: "complete", publicId: id, proof }))).status,
  ).toBe(403);
  expect(backend).not.toHaveBeenCalledWith("referralVisit", expect.anything());
});
it("excludes bots and preview traffic, rejects foreign origins, and does not attribute rejected visits", async () => {
  expect((await POST(request(undefined, "Googlebot"))).status).toBe(204);
  expect(
    (await POST(request(undefined, "Mozilla/5.0", "https://evil.example")))
      .status,
  ).toBe(403);
  vi.stubEnv("VERCEL_ENV", "preview");
  expect((await POST(request())).headers.get("set-cookie")).toBeNull();
  expect(backend).not.toHaveBeenCalledWith("referralVisit", expect.anything());
  vi.stubEnv("VERCEL_ENV", "production");
  const proof = await begin();
  vi.setSystemTime(Date.now() + 5100);
  vi.mocked(backend).mockResolvedValue(false);
  jar.set("ttw-owner", "owner-token");
  const r = await POST(request({ action: "complete", publicId: id, proof }));
  expect(r.headers.get("set-cookie")).toBeNull();
  expect(backend).toHaveBeenCalledWith(
    "referralVisit",
    expect.objectContaining({ ownerToken: "owner-token" }),
  );
});

it("returns only an opaque fallback token and keeps identity in the server mapping", async () => {
  const r = await POST(request());
  const data = await r.json();
  expect(data.visitorPingReferral).toMatch(/^[a-f0-9]{64}$/);
  const args = vi.mocked(backend).mock.calls.find(call => call[0] === "referralPrepare")![1] as { tokenHash: string; visitorHash: string };
  expect(args.tokenHash).not.toBe(data.visitorPingReferral);
  expect(data.visitorPingReferral).not.toContain(args.visitorHash);
});
