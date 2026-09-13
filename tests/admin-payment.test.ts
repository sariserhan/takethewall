import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { paymentStatus } from "../lib/payment-status";
import { POST } from "../app/api/admin/recover/route";
import { fetchAuthQuery } from "../lib/auth-server";
import { backend } from "../lib/server";
import { getStripe } from "../lib/stripe";
import { recoverPayment } from "../lib/payment-recovery";
vi.mock("../lib/auth-server", () => ({ fetchAuthQuery: vi.fn() }));
vi.mock("../lib/server", async () => ({ ...(await vi.importActual("../lib/server")), backend: vi.fn(), rate: vi.fn() }));
vi.mock("../lib/stripe", async () => ({ ...(await vi.importActual("../lib/stripe")), getStripe: vi.fn() }));
vi.mock("../lib/payment-recovery", () => ({ recoverPayment: vi.fn() }));
const retrieve = vi.fn();
const session = { id: "cs_test_admin", metadata: { takeoverId: "takeover", environment: "test" }, client_reference_id: "takeover", mode: "payment", amount_total: 499, currency: "usd", livemode: false, status: "open", payment_status: "unpaid", payment_intent: null };
const req = () => new Request("https://takethewall.com/api/admin/recover", { method: "POST", headers: { origin: "https://takethewall.com", "content-type": "application/json" }, body: JSON.stringify({ takeoverId: "takeover" }) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("WALL_ENVIRONMENT", "test"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://takethewall.com");
  vi.mocked(fetchAuthQuery).mockResolvedValueOnce("verified-admin").mockResolvedValue({ sessionId: session.id, takeoverId: "takeover", environment: "test", canRecover: true });
  retrieve.mockResolvedValue(session);
  vi.mocked(getStripe).mockReturnValue({ checkout: { sessions: { retrieve } } } as unknown as ReturnType<typeof getStripe>);
  vi.mocked(recoverPayment).mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());
it("never confuses a paid placement type with payment confirmation", () => {
  expect(paymentStatus("paid", null)).toBe("Awaiting payment");
  expect(paymentStatus("paid", { stripeStatus: "processing" })).toBe("Payment processing");
  expect(paymentStatus("paid", { expiredConfirmed: true })).toBe("Expired");
  expect(paymentStatus("paid", { paidAt: 123, stripeStatus: "unpaid" })).toBe("Paid");
  expect(paymentStatus("paid", { stripeStatus: "paid" })).toBe("Paid — publication pending");
  expect(paymentStatus("admin_counted", { issuedAt: 123 })).toBe("No payment required");
});
it.each([["open", "unpaid", "unpaid"], ["complete", "unpaid", "processing"], ["expired", "unpaid", "expired"]])("records %s / %s without publishing", async (status, payment_status, expected) => {
  retrieve.mockResolvedValue({ ...session, status, payment_status });
  const response = await POST(req());
  expect(response.status).toBe(200); expect((await response.json()).status).toBe(expected);
  expect(recoverPayment).not.toHaveBeenCalled();
  expect(backend).toHaveBeenCalledWith("adminStripeCheck", expect.objectContaining({ actor: "verified-admin", status: expected }));
});
it("reconciles only verified paid sessions", async () => {
  retrieve.mockResolvedValue({ ...session, status: "complete", payment_status: "paid", payment_intent: "pi_paid" });
  expect((await POST(req())).status).toBe(200);
  expect(recoverPayment).toHaveBeenCalledWith(session.id, "takeover");
});
it("refuses unauthenticated access before contacting Stripe", async () => {
  vi.mocked(fetchAuthQuery).mockReset().mockRejectedValue(Error("Unauthorized"));
  expect((await POST(req())).status).not.toBe(200);
  expect(retrieve).not.toHaveBeenCalled(); expect(backend).not.toHaveBeenCalled();
});
it("refuses mismatched Stripe sessions without recording or publishing", async () => {
  retrieve.mockResolvedValue({ ...session, client_reference_id: "other" });
  expect((await POST(req())).status).toBe(503);
  expect(backend).not.toHaveBeenCalled(); expect(recoverPayment).not.toHaveBeenCalled();
});
it("does not republish a paid record that is ineligible for recovery", async () => {
  vi.mocked(fetchAuthQuery).mockReset().mockResolvedValueOnce("verified-admin").mockResolvedValue({ sessionId: session.id, takeoverId: "takeover", environment: "test", canRecover: false });
  retrieve.mockResolvedValue({ ...session, status: "complete", payment_status: "paid", payment_intent: "pi_paid" });
  expect((await POST(req())).status).toBe(200); expect(recoverPayment).not.toHaveBeenCalled();
});
it("admin recovery accepts verified tax on top",async()=>{
  retrieve.mockResolvedValue({...session,status:"complete",payment_status:"paid",payment_intent:"pi_tax",amount_subtotal:499,amount_total:579,automatic_tax:{enabled:true,status:"complete"},total_details:{amount_tax:80}});
  expect((await POST(req())).status).toBe(200);
  expect(recoverPayment).toHaveBeenCalledWith(session.id,"takeover");
});
