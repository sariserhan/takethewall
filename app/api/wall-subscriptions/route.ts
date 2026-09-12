import {
  backend,
  clientHash,
  failure,
  HttpError,
  jsonBody,
  rate,
  sameOrigin,
} from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "wall-subscriptions", 15);
    const a = await jsonBody(req);
    if (a.action === "subscribe") {
      await backend("wallSubscribe", {
        frequency: a.frequency === "daily" ? "daily" : "every",
        email: String(a.email ?? ""),
        consent: a.consent === true,
        honeypot: String(a.honeypot ?? ""),
        ipHash: clientHash(req),
      });
      return Response.json({ ok: true });
    }
    if (
      a.action === "confirm" ||
      a.action === "unsubscribe" ||
      a.action === "frequency"
    ) {
      const ok = await backend<boolean>("wallSubscriptionManage", {
        token: String(a.token ?? ""),
        action: a.action,
        ...(a.action === "frequency" ? { frequency: a.frequency } : {}),
      });
      if (!ok)
        throw new HttpError(
          "This link is invalid or expired. Request a new confirmation from the live wall.",
        );
      return Response.json({ ok: true });
    }
    throw new HttpError("Unknown action");
  } catch (e) {
    return failure(e);
  }
}
