import { afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import betterAuth from "@convex-dev/better-auth/test";
import schema from "../convex/schema";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("Better Auth email OTP signs in an allowlisted administrator with a real session", async () => {
  vi.stubEnv("SITE_URL", "http://localhost:3001");
  vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
  vi.stubEnv("BETTER_AUTH_SECRET", "local-test-auth-secret-32-characters-plus");
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("RESEND_FROM", "Test <test@example.com>");
  let otp = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const data = JSON.parse(String(init?.body ?? "{}"));
      expect(data.from).toBe("Take The Wall — Account <account@takethewall.com>");
      expect(data.reply_to).toBe("support@takethewall.com");
      otp = data.text?.match(/\b\d{6}\b/)?.[0] ?? otp;
      return Response.json({ id: "mock-mail" });
    }),
  );
  const t = convexTest(schema, modules);
  betterAuth.register(t);
  const request = (path: string, body: unknown) =>
    t.fetch(`/api/auth/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3001",
      },
      body: JSON.stringify(body),
    });
  const sent = await request("email-otp/send-verification-otp", {
    email: "admin@example.com",
    type: "sign-in",
  });
  expect(sent.status).toBe(200);
  expect(otp).toMatch(/^\d{6}$/);
  const result = await request("sign-in/email-otp", {
    email: "admin@example.com",
    otp,
  });
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.user.emailVerified).toBe(true);
  expect(result.headers.get("set-cookie")).toContain("session_token");
  const repeat = await request("sign-in/email-otp", {
    email: "admin@example.com",
    otp,
  });
  expect(repeat.status).not.toBe(200);
}, 20000);
