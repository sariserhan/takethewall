import { it, expect, vi, afterEach } from "vitest";
import { recoverPayment } from "../lib/payment-recovery";
import { getStripe } from "../lib/stripe";
import { backend } from "../lib/server";
vi.mock("../lib/stripe", async () => ({
  ...(await vi.importActual("../lib/stripe")),
  getStripe: vi.fn(),
}));
vi.mock("../lib/server", () => ({
  backend: vi.fn(),
  env: vi.fn(),
  HttpError: Error,
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
const session = {
  id: "cs_test_recover",
  metadata: { takeoverId: "owner", environment: "test" },
  client_reference_id: "owner",
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  amount_total: 499,
  currency: "usd",
  livemode: false,
  payment_intent: "pi_recover",
  customer_details: { email: "receipt@example.com" },
};
function mockSession(value: unknown) {
  vi.mocked(getStripe).mockReturnValue({
    checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(value) } },
  } as unknown as ReturnType<typeof getStripe>);
}
it("recovery retrieves Stripe and uses the existing validated activation path", async () => {
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  mockSession(session);
  expect(await recoverPayment(session.id, "owner")).toBe(true);
  expect(backend).toHaveBeenCalledWith(
    "activate",
    expect.objectContaining({
      eventId: "recovery:cs_test_recover",
      amountCents: 499,
      receiptEmail: "receipt@example.com",
      takeoverId: "owner",
    }),
  );
});
it("recovery refuses unpaid, wrong-owner, wrong-amount and wrong-mode sessions", async () => {
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  mockSession({ ...session, payment_status: "unpaid" });
  expect(await recoverPayment(session.id, "owner")).toBe(false);
  mockSession(session);
  await expect(recoverPayment(session.id, "other")).rejects.toThrow(
    "reference mismatch",
  );
  mockSession({ ...session, amount_total: 1 });
  await expect(recoverPayment(session.id, "owner")).rejects.toThrow(
    "Invalid payment",
  );
  mockSession({ ...session, livemode: true });
  await expect(recoverPayment(session.id, "owner")).rejects.toThrow(
    "Invalid payment",
  );
  expect(backend).not.toHaveBeenCalled();
});
it("publication errors queue a verified failure alert and still propagate for retry", async () => {
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  mockSession(session);
  vi.mocked(backend).mockRejectedValueOnce(new Error("publication unavailable")).mockResolvedValueOnce(null);
  await expect(recoverPayment(session.id,"owner")).rejects.toThrow("publication unavailable");
  expect(backend).toHaveBeenLastCalledWith("paidPublicationFailure",{takeoverId:"owner",sessionId:session.id,paymentIntentId:"pi_recover",livemode:false});
});
