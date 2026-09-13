import type Stripe from "stripe";
import { getStripe, verifiedSession } from "./stripe";
import { activatePayment } from "./activate-payment";
export async function recoverPayment(sessionId: string, takeoverId: string) {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.metadata?.takeoverId !== takeoverId)
    throw new Error("Payment reference mismatch");
  const verified = verifiedSession(
    {
      id: "recovery:" + session.id,
      object: "event",
      api_version: null,
      created: Math.floor(Date.now() / 1000),
      pending_webhooks: 0,
      request: null,
      type: "checkout.session.completed",
      livemode: session.livemode,
      data: { object: session },
    } as Stripe.Event,
    process.env.WALL_ENVIRONMENT === "production",
  );
  if (!verified) return false;
  await activatePayment(verified);
  return true;
}
