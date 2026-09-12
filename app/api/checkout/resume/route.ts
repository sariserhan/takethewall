import {
  backend,
  env,
  failure,
  hash,
  HttpError,
  jsonBody,
  opaqueId,
  rate,
  sameOrigin,
  statusToken,
} from "@/lib/server";
import { getStripe } from "@/lib/stripe";
import { recoverPayment } from "@/lib/payment-recovery";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "checkout-resume", 12, 3600_000);
    const a = await jsonBody(req);
    if (!opaqueId(a.token)) throw new HttpError("Invalid checkout link.");
    if (a.action === "email") {
      await backend("checkoutResumeEmail", { tokenHash: hash(a.token) });
      return Response.json(
        { ok: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (a.action !== "open") throw new HttpError("Unknown action.");
    const saved = await backend<{
      takeoverId: string;
      sessionId: string;
      requestKey: string;
      name: string;
      description: string;
      environment: string;
    } | null>("checkoutResume", { tokenHash: hash(a.token) });
    if (!saved)
      return Response.json(
        { state: "unavailable" },
        { headers: { "Cache-Control": "no-store" } },
      );
    const production = process.env.WALL_ENVIRONMENT === "production";
    if (
      saved.environment !== (production ? "production" : "test") ||
      (production && process.env.VERCEL_ENV !== "production")
    )
      throw new HttpError("Checkout is unavailable in this environment.", 503);
    const session = await getStripe().checkout.sessions.retrieve(
      saved.sessionId,
    );
    if (
      session.livemode !== production ||
      session.metadata?.takeoverId !== saved.takeoverId ||
      session.client_reference_id !== saved.takeoverId ||
      session.metadata?.environment !== saved.environment ||
      session.mode !== "payment" ||
      session.amount_total !== 399 ||
      session.currency !== "usd"
    )
      throw new HttpError("Checkout verification failed.", 503);
    const token = statusToken(saved.requestKey.replace(/^embedded:/, ""));
    let result;
    if (session.payment_status === "paid") {
      await recoverPayment(session.id, saved.takeoverId);
      result = { state: "paid", token };
    } else if (session.status === "expired") result = { state: "expired" };
    else if (session.status !== "open") result = { state: "processing", token };
    else {
      const publishableKey = env("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
      if (
        !publishableKey.startsWith(production ? "pk_live_" : "pk_test_") ||
        !session.client_secret
      )
        throw new HttpError("Checkout is unavailable.", 503);
      result = {
        state: "open",
        session: { clientSecret: session.client_secret, publishableKey, token },
        name: saved.name,
        description: saved.description,
      };
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
