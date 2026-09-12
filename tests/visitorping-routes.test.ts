// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { backend } from "../lib/server";
import { POST as context } from "../app/api/context/route";
import { POST as status } from "../app/api/status/route";
import nextConfig from "../next.config";
vi.mock("../lib/server", async (original) => ({
  ...(await original<typeof import("../lib/server")>()),
  backend: vi.fn(),
  rate: vi.fn(),
}));
const owner = {
  id: "owner-123456789012",
  domain: "example.com",
  websiteUrl: "https://example.com/work?private=email#secret",
};
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://takethewall.com");
  vi.stubEnv("WALL_TOKEN_SECRET", "x".repeat(40));
  vi.stubEnv("PUBLIC_METRICS_ENABLED", "true");
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.mocked(backend).mockReset();
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: unknown) =>
  new Request("https://takethewall.com/api/test", {
    method: "POST",
    headers: {
      origin: "https://takethewall.com",
      "user-agent": "Mozilla/5.0",
      "content-type": "application/json",
      "x-vercel-ip-country": "GB",
    },
    body: JSON.stringify(body),
  });
it("provides only sanitized custom-event properties for eligible browser context", async () => {
  vi.mocked(backend).mockResolvedValue(owner);
  const data = await (
    await context(
      request({
        takeoverId: owner.id,
        visitorId: "visitor-123456789",
        pageId: "page-123456789012",
      }),
    )
  ).json();
  expect(data.visitorPing).toEqual({
    takeoverId: owner.id,
    ownerDomain: owner.domain,
    destination: "https://example.com/work",
    country: "GB",
  });
  vi.stubEnv("VERCEL_ENV", "preview");
  expect(
    (
      await (
        await context(
          request({
            takeoverId: owner.id,
            visitorId: "visitor-123456789",
            pageId: "page-123456789012",
          }),
        )
      ).json()
    ).visitorPing,
  ).toBeNull();
});
it("provides activation properties only for a verified production purchase", async () => {
  for (const state of ["pending", "expired", "active", "replaced"]) {
    vi.mocked(backend).mockResolvedValue({
      state,
      analyticsAllowed: true,
      owner,
    });
    const data = await (
      await status(request({ token: "a".repeat(64) }))
    ).json();
    expect(!!data.visitorPing).toBe(["active", "replaced"].includes(state));
  }
  vi.mocked(backend).mockResolvedValue({
    state: "active",
    analyticsAllowed: false,
    owner,
  });
  expect(
    (await (await status(request({ token: "a".repeat(64) }))).json())
      .visitorPing,
  ).toBeNull();
});
it("permits VisitorPing chat WebSockets without expanding script sources", async () => {
  const headers = await nextConfig.headers!();
  const csp = headers
    .flatMap((h) => h.headers)
    .find((h) => h.key === "Content-Security-Policy")!.value;
  expect(
    csp.split(";").find((s) => s.trim().startsWith("connect-src")),
  ).toContain("wss://realtime.visitorping.com");
  expect(
    csp.split(";").find((s) => s.trim().startsWith("script-src")),
  ).not.toContain("realtime.visitorping.com");
});
