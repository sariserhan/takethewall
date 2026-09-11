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
        ...(a.priceId
          ? { price: a.priceId }
          : {
              price_data: {
                currency: "usd",
                unit_amount: 299,
                product_data: {
                  name: "Take The Wall",
                  description:
                    "One takeover. No minimum duration, impressions, or clicks.",
                },
              },
            }),
        quantity: 1,
      },
    ],
    allow_promotion_codes: false,
    adaptive_pricing: { enabled: false },
    success_url: `${a.siteUrl}/?purchase=${a.token}`,
    cancel_url: `${a.siteUrl}/?cancelled=1`,
    expires_at: Math.floor(a.expiresAt / 1000),
  };
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
    s.amount_total !== 299 ||
    s.currency !== "usd" ||
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
    amountCents: s.amount_total,
    currency: s.currency,
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
