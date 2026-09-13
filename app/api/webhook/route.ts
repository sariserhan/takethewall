import { activatePayment } from "@/lib/activate-payment";
import { backend } from "@/lib/server";
import {
  paymentProvider,
  verifiedSession,
  verifiedExpiration,
} from "@/lib/payment-provider";
import type Stripe from "stripe";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  let event;
  try {
    event = paymentProvider.verifyWebhook(await req.text(), signature);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    const data = verifiedSession(
      event,
      process.env.WALL_ENVIRONMENT === "production",
    );
    if (data) await activatePayment(data);
    const expired = verifiedExpiration(
      event,
      process.env.WALL_ENVIRONMENT === "production",
    );
    if (expired) await backend("expire", expired);
    if (
      event.type === "charge.refunded" ||
      event.type === "charge.dispute.created"
    ) {
      const object = event.data.object as Stripe.Charge | Stripe.Dispute;
      const paymentId =
        typeof object.payment_intent === "string"
          ? object.payment_intent
          : object.payment_intent?.id;
      if (paymentId) {
        const payment = await paymentProvider.getPayment(paymentId);
        if (
          payment.metadata?.takeoverId &&
          payment.metadata.environment ===
            (process.env.WALL_ENVIRONMENT === "production"
              ? "production"
              : "test")
        )
          await backend("paymentIssue", {
            takeoverId: payment.metadata.takeoverId,
            paymentIntentId: paymentId,
            eventId: event.id,
            reason:
              event.type === "charge.refunded" ? "refunded" : "chargeback",
            livemode: event.livemode,
          });
      }
    }
    return Response.json({ received: true });
  } catch {
    return new Response("Payment processing failed; retry delivery", {
      status: 500,
    });
  }
}
