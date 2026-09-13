import type Stripe from "stripe";
import {
  checkoutParameters,
  validCheckoutAmount,
  getStripe,
  verifiedSession,
  verifiedExpiration,
} from "./stripe";
import { env } from "./server";
import { TAKEOVER_PRICE_CENTS } from "./config";
export interface PaymentProvider {
  createCheckout(
    args: Parameters<typeof checkoutParameters>[0] & {
      existingSessionId?: string;
    },
    idempotencyKey: string,
  ): Promise<{ id: string; url: string | null; clientSecret: string | null }>;
  verifyWebhook(body: string, signature: string): Stripe.Event;
  getPayment(id: string): Promise<Stripe.PaymentIntent>;
  refundPayment(
    id: string,
    idempotencyKey: string,
  ): Promise<{ id: string; status: string | null }>;
}
export const paymentProvider: PaymentProvider = {
  async createCheckout(args, idempotencyKey) {
    const stripe = getStripe();
    if (args.existingSessionId) {
      // Preserve pre-rollout checkout settings and Stripe's idempotency contract.
      const existing = await stripe.checkout.sessions.retrieve(
        args.existingSessionId,
      );
      if (
        existing.metadata?.takeoverId !== args.takeoverId ||
        existing.client_reference_id !== args.takeoverId ||
        existing.metadata?.environment !== args.environment ||
        existing.livemode !== (args.environment === "production") ||
        existing.mode !== "payment" ||
        existing.status !== "open" ||
        !validCheckoutAmount(existing)
      )
        throw new Error(
          "This checkout is complete, expired, or unavailable. Use your original checkout link to check its status.",
        );
      return {
        id: existing.id,
        url: existing.url,
        clientSecret: existing.client_secret,
      };
    }
    let productId: string | undefined;
    if (args.priceId) {
      const p = await stripe.prices.retrieve(args.priceId);
      if (
        !p.active ||
        p.unit_amount !== TAKEOVER_PRICE_CENTS ||
        p.currency !== "usd" ||
        p.type !== "one_time" ||
        p.livemode !== (args.environment === "production")
      )
        throw new Error("Checkout configuration unavailable");
      productId = typeof p.product === "string" ? p.product : p.product.id;
    }
    const s = await stripe.checkout.sessions.create(
      checkoutParameters({ ...args, productId }),
      {
        idempotencyKey,
      },
    );
    return { id: s.id, url: s.url, clientSecret: s.client_secret };
  },
  verifyWebhook(body, signature) {
    const event = getStripe().webhooks.constructEvent(
      body,
      signature,
      env("STRIPE_WEBHOOK_SECRET"),
    );
    if (event.livemode !== (process.env.WALL_ENVIRONMENT === "production"))
      throw new Error("Payment mode mismatch");
    return event;
  },
  getPayment(id) {
    return getStripe().paymentIntents.retrieve(id);
  },
  async refundPayment(id, idempotencyKey) {
    const r = await getStripe().refunds.create(
      { payment_intent: id },
      { idempotencyKey },
    );
    return { id: r.id, status: r.status ?? null };
  },
};
export { verifiedSession, verifiedExpiration };
