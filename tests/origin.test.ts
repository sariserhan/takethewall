// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sameOrigin } from "../lib/server";
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3001");
  vi.stubEnv("VERCEL", "");
});
afterEach(() => vi.unstubAllEnvs());
function request(url: string, origin?: string) {
  return new Request(url, {
    method: "POST",
    headers: origin ? { origin } : {},
  });
}
it.each([
  "http://localhost:4000",
  "http://127.0.0.1:3025",
  "http://[::1]:4000",
])("accepts the exact local server origin %s", (origin) => {
  vi.stubEnv("NODE_ENV", "production");
  expect(() =>
    sameOrigin(request(origin + "/api/wall-vote", origin)),
  ).not.toThrow();
});
it.each([
  undefined,
  "null",
  "http://localhost:3001",
  "https://evil.example",
  "http://localhost.evil.example:4000",
])("rejects cross-origin local voting from %s", (origin) => {
  expect(() =>
    sameOrigin(request("http://localhost:4000/api/wall-vote", origin)),
  ).toThrow("Invalid request origin");
});
it("keeps public and Vercel requests tied to the configured origin", () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://takethewall.com");
  expect(() =>
    sameOrigin(
      request(
        "https://takethewall.com/api/wall-vote",
        "https://takethewall.com",
      ),
    ),
  ).not.toThrow();
  expect(() =>
    sameOrigin(
      request("https://takethewall.com/api/wall-vote", "http://localhost:4000"),
    ),
  ).toThrow();
  expect(() =>
    sameOrigin(
      request("https://evil.example/api/wall-vote", "https://evil.example"),
    ),
  ).toThrow();
  vi.stubEnv("VERCEL", "1");
  expect(() =>
    sameOrigin(
      request("http://localhost:3000/api/wall-vote", "http://localhost:3000"),
    ),
  ).toThrow();
  expect(() =>
    sameOrigin(
      request("http://localhost:3000/api/wall-vote", "https://takethewall.com"),
    ),
  ).not.toThrow();
});
it("ignores forged proxy headers", () => {
  const req = request(
    "http://localhost:4000/api/wall-vote",
    "https://evil.example",
  );
  req.headers.set("x-forwarded-host", "evil.example");
  req.headers.set("x-forwarded-proto", "https");
  expect(() => sameOrigin(req)).toThrow();
});

it("uses a loopback Host when Next normalizes the request hostname", () => {
  const req = request(
    "http://localhost:4000/api/wall-vote",
    "http://127.0.0.1:4000",
  );
  req.headers.set("host", "127.0.0.1:4000");
  expect(() => sameOrigin(req)).not.toThrow();
  req.headers.set("host", "127.0.0.1:3001");
  expect(() => sameOrigin(req)).toThrow();
  req.headers.set("host", "evil.example:4000");
  expect(() => sameOrigin(req)).toThrow();
});
