// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { POST } from "../app/api/status/route";
import { backend } from "../lib/server";
import { recoverPayment } from "../lib/payment-recovery";
vi.mock("../lib/server", async (original) => ({
  ...(await original<typeof import("../lib/server")>()),
  backend: vi.fn(),
  rate: vi.fn(),
  sameOrigin: vi.fn(),
}));
vi.mock("../lib/payment-recovery", () => ({ recoverPayment: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const request = () =>
  new Request("http://localhost:4000/api/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: "a".repeat(64),
      sessionId: "attacker-supplied",
    }),
  });
it("recovers a missing webhook using only the session bound to the confirmation token", async () => {
  vi.mocked(backend)
    .mockResolvedValueOnce({ state: "pending", owner: null })
    .mockResolvedValueOnce({ sessionId: "cs_saved", takeoverId: "saved-owner" })
    .mockResolvedValueOnce({ state: "active", owner: null });
  vi.mocked(recoverPayment).mockResolvedValue(true);
  expect((await (await POST(request())).json()).state).toBe("active");
  expect(recoverPayment).toHaveBeenCalledWith("cs_saved", "saved-owner");
});
it("keeps unpaid sessions pending and respects recovery throttling", async () => {
  vi.mocked(backend)
    .mockResolvedValueOnce({ state: "pending", owner: null })
    .mockResolvedValueOnce(null);
  expect((await (await POST(request())).json()).state).toBe("pending");
  expect(recoverPayment).not.toHaveBeenCalled();
  vi.mocked(backend)
    .mockResolvedValueOnce({ state: "pending", owner: null })
    .mockResolvedValueOnce({
      sessionId: "cs_saved",
      takeoverId: "saved-owner",
    });
  vi.mocked(recoverPayment).mockResolvedValue(false);
  expect((await (await POST(request())).json()).state).toBe("pending");
});
it("does not recover invalid tokens or already published purchases", async () => {
  for (const state of ["invalid", "expired", "active", "replaced"]) {
    vi.mocked(backend).mockResolvedValueOnce({ state, owner: null });
    expect((await (await POST(request())).json()).state).toBe(state);
  }
  expect(recoverPayment).not.toHaveBeenCalled();
  expect(backend).toHaveBeenCalledTimes(4);
});
