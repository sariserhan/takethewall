import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { POST } from "../app/api/checkout/resume/route";
import { backend } from "../lib/server";
import { getStripe } from "../lib/stripe";
import { recoverPayment } from "../lib/payment-recovery";
vi.mock("../lib/server", async () => ({
  ...(await vi.importActual("../lib/server")),
  backend: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("../lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("../lib/payment-recovery", () => ({
  recoverPayment: vi.fn().mockResolvedValue(true),
}));
const saved = {
  takeoverId: "owner",
  sessionId: "cs_test_saved",
  requestKey: "embedded:request-key",
  name: "My project",
  description: "Saved content",
  environment: "test",
};
const session = {
  id: saved.sessionId,
  livemode: false,
  metadata: { takeoverId: "owner", environment: "test" },
  client_reference_id: "owner",
  amount_total: 399,
  currency: "usd",
  mode: "payment",
  status: "open",
  payment_status: "unpaid",
  client_secret: "existing-session-secret",
};
const retrieve = vi.fn();
const request = (action = "open", origin = "https://takethewall.com") =>
  new Request("https://takethewall.com/api/checkout/resume", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ action, token: "a".repeat(64) }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://takethewall.com");
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  vi.stubEnv("WALL_TOKEN_SECRET", "secret-at-least-32-characters-long");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_key");
  vi.mocked(backend).mockResolvedValue(saved);
  retrieve.mockResolvedValue(session);
  vi.mocked(getStripe).mockReturnValue({
    checkout: { sessions: { retrieve } },
  } as unknown as ReturnType<typeof getStripe>);
});
afterEach(() => vi.unstubAllEnvs());
it("reopens the existing checkout without creating a purchase or exposing server request keys", async () => {
  const response = await POST(request());
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(data).toMatchObject({
    state: "open",
    name: "My project",
    session: { clientSecret: "existing-session-secret" },
  });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(data).not.toHaveProperty("requestKey");
  expect(backend).toHaveBeenCalledTimes(1);
  expect(recoverPayment).not.toHaveBeenCalled();
});
it.each([
  ["complete", "paid", "paid"],
  ["complete", "unpaid", "processing"],
  ["expired", "unpaid", "expired"],
])(
  "handles %s/%s without returning a payment form",
  async (status, payment_status, state) => {
    retrieve.mockResolvedValue({ ...session, status, payment_status });
    const data = await (await POST(request())).json();
    expect(data.state).toBe(state);
    expect(data).not.toHaveProperty("session");
    expect(recoverPayment).toHaveBeenCalledTimes(state === "paid" ? 1 : 0);
  },
);
it("rejects missing capabilities, mismatched Stripe metadata and cross-origin requests", async () => {
  vi.mocked(backend).mockResolvedValue(null);
  expect(await (await POST(request())).json()).toEqual({
    state: "unavailable",
  });
  expect(retrieve).not.toHaveBeenCalled();
  vi.mocked(backend).mockResolvedValue(saved);
  retrieve.mockResolvedValue({ ...session, client_reference_id: "other" });
  expect((await POST(request())).status).toBe(503);
  expect((await POST(request("open", "https://other.example"))).status).toBe(
    403,
  );
});
it("email request uses only the protected purchase token, never an arbitrary recipient", async () => {
  expect((await POST(request("email"))).status).toBe(200);
  expect(backend).toHaveBeenCalledWith("checkoutResumeEmail", {
    tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(retrieve).not.toHaveBeenCalled();
});
