import { validateWallContent } from "@/lib/content";
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
import { validateEmail } from "@/lib/validation";
import { paymentProvider } from "@/lib/payment-provider";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "checkout", 15, 3600_000);
    const a = await jsonBody(req);
    if (
      !opaqueId(a.requestKey) ||
      (a.uploadKey !== "" &&
        a.uploadKey !== undefined &&
        !opaqueId(a.uploadKey))
    )
      throw new HttpError("Invalid checkout or image reference.");
    const content = validateWallContent(a);
    if (content.contentType !== "personal")
      await publicDestination(content.websiteUrl);
    const buyerEmail = validateEmail(a.buyerEmail);
    const environment =
      process.env.WALL_ENVIRONMENT === "production" ? "production" : "test";
    if (environment === "production" && process.env.VERCEL_ENV !== "production")
      throw new HttpError(
        "Live checkout is unavailable in this environment",
        503,
      );
    const publishableKey = env("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    if (
      !publishableKey.startsWith(
        environment === "production" ? "pk_live_" : "pk_test_",
      )
    )
      throw new HttpError("Payment configuration is unavailable.", 503);
    const token = statusToken(a.requestKey),
      siteUrl = env("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");
    const pending = await backend<{
      takeoverId: string;
      purchaseId: string;
      checkoutUrl: string | null;
      checkoutExpiresAt: number;
    }>("pending", {
      requestKey: "embedded:" + a.requestKey,
      fingerprint: hash(JSON.stringify([content, buyerEmail, a.uploadKey])),
      tokenHash: hash(token),
      ownerHash: clientHash(req),
      uploadKey: a.uploadKey ?? "",
      websiteUrl: content.websiteUrl,
      description: content.description,
      displayName: content.displayName,
      contentType: content.contentType,
      linkType: content.linkType,
      buyerEmail,
      environment,
    });
    const session = await paymentProvider.createCheckout(
      {
        takeoverId: pending.takeoverId,
        email: buyerEmail,
        token,
        expiresAt: pending.checkoutExpiresAt,
        siteUrl,
        priceId: process.env.STRIPE_PRICE_ID,
        environment,
      },
      "takeover:" + pending.purchaseId,
    );
    if (!session.clientSecret) throw new HttpError("Checkout unavailable", 503);
    await backend("attach", {
      purchaseId: pending.purchaseId,
      sessionId: session.id,
      checkoutUrl: "",
    });
    return Response.json(
      { clientSecret: session.clientSecret, publishableKey, token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
