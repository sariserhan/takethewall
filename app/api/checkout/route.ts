import {
  backend,
  clientHash,
  env,
  failure,
  hash,
  HttpError,
  jsonBody,
  opaqueId,
  publicDestination,
  rate,
  sameOrigin,
  statusToken,
} from "@/lib/server";
import {
  validateEmail,
  validateDescription,
  validateContent,
} from "@/lib/validation";
import { checkoutParameters, getStripe } from "@/lib/stripe";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "checkout", 15, 3600_000);
    const a = await jsonBody(req);
    if (!opaqueId(a.requestKey) || !opaqueId(a.uploadKey))
      throw new HttpError("Choose a logo before paying.");
    const url = await publicDestination(a.websiteUrl);
    const buyerEmail = validateEmail(a.buyerEmail),
      description = validateDescription(a.description);
    validateContent(url.domain, description, process.env.BLOCKED_DOMAINS);
    const stripe = getStripe();
    const environment =
      process.env.WALL_ENVIRONMENT === "production" ? "production" : "test";
    if (environment === "production" && process.env.VERCEL_ENV !== "production")
      throw new HttpError(
        "Live checkout is unavailable in this environment",
        503,
      );
    const token = statusToken(a.requestKey),
      siteUrl = env("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");
    if (process.env.STRIPE_PRICE_ID) {
      const price = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID);
      if (
        !price.active ||
        price.unit_amount !== 299 ||
        price.currency !== "usd" ||
        price.type !== "one_time" ||
        price.livemode !== (environment === "production")
      )
        throw new HttpError("Checkout configuration unavailable", 503);
    }
    const pending = await backend<{
      takeoverId: string;
      purchaseId: string;
      checkoutUrl: string | null;
      checkoutExpiresAt: number;
    }>("pending", {
      requestKey: a.requestKey,
      fingerprint: hash(
        JSON.stringify([url.websiteUrl, description, buyerEmail, a.uploadKey]),
      ),
      tokenHash: hash(token),
      ownerHash: clientHash(req),
      uploadKey: a.uploadKey,
      websiteUrl: url.websiteUrl,
      description,
      buyerEmail,
      environment,
    });
    if (pending.checkoutUrl) return Response.json({ url: pending.checkoutUrl });
    const session = await stripe.checkout.sessions.create(
      checkoutParameters({
        takeoverId: pending.takeoverId,
        email: buyerEmail,
        token,
        expiresAt: pending.checkoutExpiresAt,
        siteUrl,
        priceId: process.env.STRIPE_PRICE_ID,
        environment,
      }),
      { idempotencyKey: "takeover:" + pending.purchaseId },
    );
    if (!session.url) throw new HttpError("Checkout unavailable", 503);
    await backend("attach", {
      purchaseId: pending.purchaseId,
      sessionId: session.id,
      checkoutUrl: session.url,
    });
    return Response.json({ url: session.url });
  } catch (e) {
    return failure(e);
  }
}
