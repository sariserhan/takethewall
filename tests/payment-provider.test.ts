import { afterEach, it, expect, vi } from "vitest";
import { paymentProvider } from "../lib/payment-provider";
import { getStripe } from "../lib/stripe";
vi.mock("../lib/stripe", async () => ({
  ...(await vi.importActual("../lib/stripe")),
  getStripe: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
const args = {
  takeoverId: "owner",
  email: "test@example.com",
  token: "token",
  expiresAt: Date.now() + 86400000,
  siteUrl: "https://takethewall.com",
  environment: "test",
};
it("reuses a configured product with tax-exclusive inline pricing without mutating its price", async () => {
  const create = vi
    .fn()
    .mockResolvedValue({ id: "cs_new", client_secret: "secret", url: null });
  vi.mocked(getStripe).mockReturnValue({
    prices: {
      retrieve: vi
        .fn()
        .mockResolvedValue({
          active: true,
          unit_amount: 399,
          currency: "usd",
          type: "one_time",
          livemode: false,
          product: "prod_original",
          tax_behavior: "inclusive",
        }),
    },
    checkout: { sessions: { create } },
  } as unknown as ReturnType<typeof getStripe>);
  await paymentProvider.createCheckout(
    { ...args, priceId: "price_original" },
    "key",
  );
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      automatic_tax: { enabled: true },
      adaptive_pricing: { enabled: true },
      line_items: [
        {
          quantity: 1,
          price_data: {
            unit_amount: 399,
            currency: "usd",
            tax_behavior: "exclusive",
            product: "prod_original",
          },
        },
      ],
    }),
    { idempotencyKey: "key" },
  );
});
it("retrieves an existing legacy session instead of changing its idempotent creation parameters", async () => {
  const create = vi.fn();
  const retrieve = vi
    .fn()
    .mockResolvedValue({
      id: "cs_old",
      client_secret: "old-secret",
      url: null,
      metadata: { takeoverId: "owner", environment: "test" },
      client_reference_id: "owner",
      livemode: false,
      mode: "payment",
      status: "open",
      currency: "usd",
      amount_total: 399,
    });
  vi.mocked(getStripe).mockReturnValue({
    checkout: { sessions: { create, retrieve } },
  } as unknown as ReturnType<typeof getStripe>);
  expect(
    await paymentProvider.createCheckout(
      { ...args, existingSessionId: "cs_old" },
      "old-key",
    ),
  ).toMatchObject({ id: "cs_old", clientSecret: "old-secret" });
  expect(create).not.toHaveBeenCalled();
  retrieve.mockResolvedValueOnce({ metadata: { takeoverId: "other" } });
  await expect(
    paymentProvider.createCheckout(
      { ...args, existingSessionId: "cs_bad" },
      "old-key",
    ),
  ).rejects.toThrow();
});
