// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";
import Stripe from "stripe";
import { checkoutParameters, verifiedSession } from "../lib/stripe";
import {
  hash,
  statusToken,
  readContext,
  signContext,
  publicDestination,
} from "../lib/server";
import { visitorPingProperties, emailMessage } from "../lib/delivery";
import { POST as webhook } from "../app/api/webhook/route";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
import { lookup } from "node:dns/promises";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function stripeEvent(patch: Record<string, unknown> = {}) {
  return {
    id: "evt_123",
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: "cs_123",
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        amount_total: 499,
        currency: "usd",
        livemode: false,
        metadata: { takeoverId: "takeover123", environment: "test" },
        client_reference_id: "takeover123",
        payment_intent: "pi_123",
        customer_details: { email: "final@example.com" },
        ...patch,
      },
    },
  } as unknown as Stripe.Event;
}
describe("Checkout and webhook boundary", () => {
  it("sets fixed one-time USD price, email and opaque return token", () => {
    const p = checkoutParameters({
      takeoverId: "takeover",
      email: "buyer@example.com",
      token: "opaque",
      expiresAt: 100000,
      siteUrl: "https://takethewall.com",
      environment: "test",
    });
    expect(p).toMatchObject({
      mode: "payment",
      customer_email: "buyer@example.com",
      line_items: [
        { quantity: 1, price_data: { unit_amount: 499, currency: "usd", tax_behavior:"exclusive" } },
      ],
      allow_promotion_codes: false,
      automatic_tax: {enabled:true},
      adaptive_pricing: {enabled:true},
      ui_mode: "embedded_page",
      redirect_on_completion: "if_required",
      return_url: "https://takethewall.com/?purchase=opaque",
    });
    expect(p.metadata).not.toHaveProperty("email");
  });
  it("accepts only authoritative successful sessions", () => {
    expect(verifiedSession(stripeEvent(), false)).toMatchObject({
      amountCents: 499,
      receiptEmail: "final@example.com",
    });
    expect(
      verifiedSession(stripeEvent({ payment_status: "unpaid" }), false),
    ).toBeNull();
    expect(() =>
      verifiedSession(stripeEvent({ amount_total: 299 }), false),
    ).toThrow();
    expect(() => verifiedSession(stripeEvent(), true)).toThrow();
  });
  it("verifies raw-body Stripe signatures and ignores forged signatures", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("WALL_SERVER_SECRET", "a".repeat(40));
    vi.stubEnv("CONVEX_HTTP_URL", "https://backend.convex.site");
    vi.stubEnv("WALL_ENVIRONMENT", "test");
    const body = JSON.stringify(stripeEvent());
    const stripe = new Stripe("sk_test_dummy");
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: "whsec_test",
    });
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ activated: true }));
    vi.stubGlobal("fetch", fetcher);
    expect(
      (
        await webhook(
          new Request("https://takethewall.com/api/webhook", {
            method: "POST",
            body,
            headers: { "stripe-signature": "forged" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      (
        await webhook(
          new Request("https://takethewall.com/api/webhook", {
            method: "POST",
            body,
            headers: { "stripe-signature": signature },
          }),
        )
      ).status,
    ).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("validates every DNS answer without fetching destinations", async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ] as never);
    await expect(publicDestination("https://public.com")).rejects.toThrow(
      "public",
    );
    vi.mocked(lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    expect(await publicDestination("https://public.com")).toMatchObject({
      domain: "public.com",
    });
  });
});
describe("privacy and tokens", () => {
  it("mints stable unguessable purchase tokens and rejects forged event contexts", () => {
    vi.stubEnv("WALL_TOKEN_SECRET", "s".repeat(40));
    const token = statusToken("request");
    expect(statusToken("request")).toBe(token);
    expect(hash(token)).not.toBe(token);
    expect(statusToken("another")).not.toBe(token);
    const context = {
      takeoverId: "t",
      visitorHash: "v",
      pageId: "p",
      region: "US",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 30000,
      excluded: false,
    };
    const signed = signContext(context);
    expect(readContext(signed)).toEqual(context);
    expect(() => readContext(signed.slice(0, -1) + "x")).toThrow();
    expect(() =>
      readContext(signContext({ ...context, expiresAt: 0 })),
    ).toThrow();
  });
  it("uses the actual VisitorPing payload without private fields or query strings", () => {
    const payload = visitorPingProperties({
      takeoverId: "t",
      domain: "example.com",
      websiteUrl: "https://example.com/?email=secret#token",
      region: "US",
    });
    expect(payload).toEqual({
      takeoverId: "t",
      ownerDomain: "example.com",
      destination: "https://example.com/",
      country: "US",
    });
    expect(JSON.stringify(payload)).not.toMatch(/email|payment|token/);
  });
  it("notifies recorded events without promising current ownership", () => {
    expect(
      emailMessage({
        kind: "activation_email",
        domain: "example.com",
        activatedAt: 0,
      }).text,
    ).toContain("may already have taken");
    expect(
      emailMessage({
        kind: "replacement_email",
        domain: "example.com",
        activatedAt: 0,
        replacedAt: 3000,
      }).text,
    ).toContain("3 seconds");
  });
});

it("accepts the exact base price plus verified automatic tax and records local presentment", () => {
  const event=stripeEvent({amount_subtotal:499,amount_total:579,automatic_tax:{enabled:true,status:"complete"},total_details:{amount_tax:80,amount_shipping:0,amount_discount:0},presentment_details:{presentment_amount:439,presentment_currency:"eur"}});
  expect(verifiedSession(event,false)).toMatchObject({amountCents:579,taxCents:80,currency:"usd",presentmentAmount:439,presentmentCurrency:"eur"});
});
it.each([
  {amount_subtotal:499,amount_total:579},
  {amount_subtotal:400,amount_total:480,automatic_tax:{enabled:true,status:"complete"},total_details:{amount_tax:80}},
  {amount_subtotal:499,amount_total:578,automatic_tax:{enabled:true,status:"complete"},total_details:{amount_tax:80}},
  {amount_subtotal:499,amount_total:579,automatic_tax:{enabled:true,status:"requires_location_inputs"},total_details:{amount_tax:80}},
  {amount_subtotal:499,amount_total:499,automatic_tax:{enabled:true,status:"complete"},total_details:{amount_tax:0,amount_discount:1}},
  {amount_subtotal:499,amount_total:579,automatic_tax:{enabled:true,status:"complete"},total_details:{amount_tax:80,amount_shipping:1}},
])("rejects unverified totals, wrong base prices, incomplete tax, discounts and shipping", patch=>{
  expect(()=>verifiedSession(stripeEvent(patch),false)).toThrow("Invalid payment confirmation");
});
it("accepts completed automatic tax with zero due",()=>{
  expect(verifiedSession(stripeEvent({amount_subtotal:499,automatic_tax:{enabled:true,status:"complete"},total_details:{amount_tax:0}}),false)).toMatchObject({amountCents:499,taxCents:0});
});

it("accepts verified legacy-priced Stripe sessions during the price transition", () => {
  expect(verifiedSession(stripeEvent({ amount_total: 399 }), false)).toMatchObject({ amountCents: 399 });
  const p = checkoutParameters({ takeoverId: "old", email: "buyer@example.com", token: "opaque", expiresAt: 100000,
    siteUrl: "https://takethewall.com", environment: "test", basePriceCents: 399 });
  expect(p.line_items?.[0].price_data?.unit_amount).toBe(399);
});
