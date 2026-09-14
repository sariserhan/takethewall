import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { backend, HttpError, jsonBody, opaqueId, readContext } from "@/lib/server";
import {
  parseVisitorPingAlert,
  VisitorPingValidationError,
} from "@/lib/visitorping-webhook";
export const runtime = "nodejs";
function reply(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(req: Request) {
  // Domain-separated bearer credential; never expose WALL_SERVER_SECRET itself.
  const serverSecret = process.env.WALL_SERVER_SECRET;
  if (!serverSecret || serverSecret.length < 32)
    return reply({ error: "Webhook unavailable" }, 503);
  const expected = createHmac("sha256", serverSecret)
    .update("visitorping:webhook:v1")
    .digest("hex");
  const supplied =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ??
    new URL(req.url).searchParams.get("token") ??
    "";
  if (
    !/^[a-f0-9]{64}$/.test(supplied) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return reply({ error: "Unauthorized" }, 401);
  if (
    !req.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return reply({ error: "Expected application/json" }, 415);
  let payload;
  try {
    const body = await jsonBody(req, 16_384);
    if (body?.event === "wall.referral") {
      const data = body.data;
      if (typeof data?.token !== "string" || !/^[a-f0-9]{64}$/.test(data.token) || typeof data?.publicId !== "string" || !/^ttw_[a-f0-9]{32}$/.test(data.publicId) || typeof data?.occurredAt !== "number" || !Number.isFinite(data.occurredAt)) throw new VisitorPingValidationError("Invalid shared referral");
      try {
        const accepted = await backend<boolean>("referralReceive", { tokenHash: createHash("sha256").update(data.token).digest("hex"), publicId: data.publicId, occurredAt: data.occurredAt });
        return reply({ ok: true, accepted }, 200);
      } catch {
        return reply({ error: "Could not store referral; retry delivery" }, 503);
      }
    }
    if (body?.event === "wall.impression") {
      if (!opaqueId(body?.data?.eventId) || typeof body?.data?.context !== "string")
        throw new VisitorPingValidationError("Invalid shared visit identifier");
      const context = readContext(body.data.context, 86400_000);
      const location = body.data.location;
      if (!location || typeof location.country !== "string" || typeof location.city !== "string" || location.city.length > 160)
        throw new VisitorPingValidationError("Invalid visit location");
      const country = location.country.toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) throw new VisitorPingValidationError("Invalid visit country");
      try {
        await backend("event", { ...context, event: "impression", eventId: body.data.eventId, source: "visitorping", region: country, city: location.city });
        return reply({ ok: true }, 200);
      } catch {
        return reply({ error: "Could not store visit; retry delivery" }, 503);
      }
    }
    payload = parseVisitorPingAlert(body);
  } catch (error) {
    return reply(
      {
        error:
          error instanceof HttpError && error.status === 413
            ? "Request too large"
            : error instanceof VisitorPingValidationError
              ? `Invalid VisitorPing alert: ${error.message}`
              : "Invalid VisitorPing alert: malformed JSON",
      },
      error instanceof HttpError && error.status === 413 ? 413 : 400,
    );
  }
  try {
    await backend("visitorPingAlert", { payload });
    return reply({ ok: true }, 200);
  } catch {
    // Acknowledge only persisted deliveries; failures must be eligible for retry.
    return reply({ error: "Could not store alert; retry delivery" }, 503);
  }
}
