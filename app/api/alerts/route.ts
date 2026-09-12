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
    await rate(req, "milestone-alerts", 15);
    const a = await jsonBody(req);
    if (a.action === "subscribe") {
      await backend("alertSubscribe", {
        email: String(a.email ?? ""),
        consent: a.consent === true,
        honeypot: String(a.honeypot ?? ""),
        ipHash: clientHash(req),
      });
      return Response.json({ ok: true });
    }
    if (a.action === "confirm" || a.action === "unsubscribe") {
      const ok = await backend<boolean>("alertManage", {
        token: String(a.token ?? ""),
        action: a.action,
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
