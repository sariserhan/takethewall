import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  backend,
  failure,
  HttpError,
  jsonBody,
  rate,
  sameOrigin,
} from "@/lib/server";
import { getStripe } from "@/lib/stripe";
import { recoverPayment } from "@/lib/payment-recovery";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const actor = await fetchAuthQuery(api.admin.identity, {});
    await rate(req, "admin-payment-recovery", 10);
    const a = await jsonBody(req);
    const p = await fetchAuthQuery(api.deliveryAdmin.payment, {
      takeoverId: String(a.takeoverId) as Id<"takeovers">,
    });
    const production = process.env.WALL_ENVIRONMENT === "production";
    if (
      p.environment !== (production ? "production" : "test") ||
      (production && process.env.VERCEL_ENV !== "production")
    )
      throw new HttpError("Payment environment mismatch", 503);
    const s = await getStripe().checkout.sessions.retrieve(p.sessionId);
    if (
      s.livemode !== production ||
      s.metadata?.environment !== p.environment ||
      s.metadata?.takeoverId !== p.takeoverId ||
      s.client_reference_id !== p.takeoverId ||
      s.mode !== "payment" ||
      s.amount_total !== 399 ||
      s.currency !== "usd"
    )
      throw new HttpError("Stripe payment reference mismatch", 503);
    if (s.payment_status === "paid" && (s.status !== "complete" || !s.payment_intent)) throw new HttpError("Stripe payment is not a verified completed session", 503);
    const status =
      s.payment_status === "paid"
        ? "paid"
        : s.status === "expired"
          ? "expired"
          : s.status === "complete"
            ? "processing"
            : "unpaid";
    await backend("adminStripeCheck", {
      takeoverId: p.takeoverId,
      sessionId: p.sessionId,
      environment: p.environment,
      actor,
      status,
    });
    let message =
      status === "expired"
        ? "Stripe confirms this checkout expired without payment. Nothing was published."
        : status === "processing"
          ? "Stripe checkout is complete, but payment is still processing. Nothing was published; do not ask the buyer to pay again."
          : "Stripe has not confirmed payment. Nothing was published.";
    if (status === "paid") {
      if (p.canRecover) {
        const recovered = await recoverPayment(p.sessionId, p.takeoverId);
        message = recovered
          ? "Stripe confirmed payment and it was reconciled. See the timeline for publication and email status."
          : "Payment could not be reconciled. Check Stripe again before taking further action.";
      } else
        message =
          "Stripe confirms payment. No publication was attempted: this placement is already processed or is not eligible for recovery.";
    }
    return Response.json(
      { status, message },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
