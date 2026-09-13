import { TAKEOVER_PRICE_CENTS, LEGACY_TAKEOVER_PRICE_CENTS } from "./config";
import Stripe from "stripe";
import { env, HttpError } from "./server";
export const getStripe = () => {
  const key = env("STRIPE_SECRET_KEY");
  const production = process.env.WALL_ENVIRONMENT === "production";
  if (!new RegExp("^(sk|rk)_" + (production ? "live" : "test") + "_").test(key))
    throw new HttpError(
      "Payment environment is not configured correctly.",
      503,
    );
  return new Stripe(key, { maxNetworkRetries: 2 });
};
export function checkoutParameters(a: {
  takeoverId: string;
  email: string;
  token: string;
  expiresAt: number;
  siteUrl: string;
  priceId?: string;
  basePriceCents?: number;
  productId?: string;
  environment: string;
}): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    customer_email: a.email,
    client_reference_id: a.takeoverId,
    metadata: { takeoverId: a.takeoverId, environment: a.environment },
    payment_intent_data: {
      metadata: { takeoverId: a.takeoverId, environment: a.environment },
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: a.basePriceCents ?? TAKEOVER_PRICE_CENTS,
          tax_behavior: "exclusive",
          ...(a.productId
            ? { product: a.productId }
            : {
                product_data: {
                  name: "Take The Wall",
                  description:
                    "One takeover. No minimum duration, impressions, or clicks.",
                  ...(process.env.STRIPE_TAX_CODE
                    ? { tax_code: process.env.STRIPE_TAX_CODE }
                    : {}),
                },
              }),
        },
        quantity: 1,
      },
    ],
    allow_promotion_codes: false,
    adaptive_pricing: { enabled: true },
    automatic_tax: { enabled: true },
    ui_mode: "embedded_page",
    redirect_on_completion: "if_required",
    return_url: `${a.siteUrl}/?purchase=${a.token}`,
    expires_at: Math.floor(a.expiresAt / 1000),
  };
}
// Adaptive Pricing keeps these amounts in integration currency (USD).
// The customer's converted total lives separately in presentment_details.
export function validCheckoutAmount(
  s: Stripe.Checkout.Session,
  requireFinalTax = false,
  expectedBasePrice?: number,
) {
  const tax = s.total_details?.amount_tax ?? 0;
  const presentation = s.presentment_details;
  const base = (s.amount_total ?? 0) - tax;
  return (
    s.currency === "usd" &&
    Number.isSafeInteger(tax) &&
    tax >= 0 &&
    [TAKEOVER_PRICE_CENTS, LEGACY_TAKEOVER_PRICE_CENTS].includes(base) &&
    (expectedBasePrice === undefined || base === expectedBasePrice) &&
    (s.total_details?.amount_discount ?? 0) === 0 &&
    (s.total_details?.amount_shipping ?? 0) === 0 &&
    (s.automatic_tax?.enabled
      ? s.amount_subtotal === base &&
        (!requireFinalTax || s.automatic_tax.status === "complete")
      : tax === 0 &&
        (s.amount_subtotal == null || s.amount_subtotal === base)) &&
    (!presentation ||
      (Number.isSafeInteger(presentation.presentment_amount) &&
        presentation.presentment_amount > 0 &&
        /^[a-z]{3}$/.test(presentation.presentment_currency)))
  );
}

export function verifiedSession(event: Stripe.Event, production: boolean) {
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  )
    return null;
  const s = event.data.object as Stripe.Checkout.Session;
  if (s.payment_status !== "paid") return null;
  if (
    s.mode !== "payment" ||
    s.status !== "complete" ||
    !validCheckoutAmount(s, true) ||
    s.livemode !== production ||
    event.livemode !== production ||
    s.metadata?.environment !== (production ? "production" : "test") ||
    !s.metadata?.takeoverId ||
    !s.payment_intent ||
    s.client_reference_id !== s.metadata.takeoverId
  )
    throw new Error("Invalid payment confirmation");
  return {
    takeoverId: s.metadata.takeoverId,
    eventId: event.id,
    sessionId: s.id,
    paymentIntentId:
      typeof s.payment_intent === "string"
        ? s.payment_intent
        : s.payment_intent.id,
    amountCents: s.amount_total!,
    taxCents: s.total_details?.amount_tax ?? 0,
    ...(s.presentment_details
      ? {
          presentmentAmount: s.presentment_details.presentment_amount,
          presentmentCurrency: s.presentment_details.presentment_currency,
        }
      : {}),
    currency: s.currency!,
    paid: true,
    livemode: s.livemode,
    ...(s.customer_details?.email
      ? { receiptEmail: s.customer_details.email }
      : {}),
  };
}

export function verifiedExpiration(event: Stripe.Event, production: boolean) {
  if (event.type !== "checkout.session.expired") return null;
  const s = event.data.object as Stripe.Checkout.Session;
  if (
    s.status !== "expired" ||
    s.payment_status !== "unpaid" ||
    s.livemode !== production ||
    event.livemode !== production ||
    !s.metadata?.takeoverId ||
    s.metadata.environment !== (production ? "production" : "test")
  )
    throw new Error("Invalid checkout expiry");
  return {
    takeoverId: s.metadata.takeoverId,
    sessionId: s.id,
    livemode: s.livemode,
  };
}
