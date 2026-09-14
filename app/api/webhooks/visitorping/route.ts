import { createHmac, timingSafeEqual } from "node:crypto";
import { backend, HttpError, jsonBody } from "@/lib/server";
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
    payload = parseVisitorPingAlert(await jsonBody(req, 16_384));
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
