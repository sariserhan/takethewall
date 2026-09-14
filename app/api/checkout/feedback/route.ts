import {
  backend,
  clientHash,
  failure,
  HttpError,
  jsonBody,
  sameOrigin,
} from "@/lib/server";
import { checkoutFeedbackReasons } from "@/lib/checkout-feedback";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await jsonBody(req);
    if (
      !checkoutFeedbackReasons.includes(a.reason) ||
      !["design", "preview"].includes(a.stage) ||
      typeof a.details !== "string" ||
      a.details.length > 500
    )
      throw new HttpError(
        "Choose a reason and keep your comment under 500 characters.",
      );
    await backend("checkoutFeedback", {
      reason: a.reason,
      stage: a.stage,
      details: a.details,
      ipHash: clientHash(req),
      honeypot: typeof a.company === "string" ? a.company : "",
    });
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
