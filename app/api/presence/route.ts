import { backend, failure, HttpError, jsonBody, opaqueId, rate, readContext, sameOrigin } from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "presence", 180);
    const body = await jsonBody(req);
    if (body.action === "disconnect") {
      // This unguessable capability can only disconnect its own session.
      if (typeof body.sessionToken !== "string" || body.sessionToken.length > 256)
        throw new HttpError("Invalid presence session");
      await backend("presenceDisconnect", { sessionToken: body.sessionToken });
      return new Response(null, { status: 204 });
    }
    if (body.action !== "heartbeat" || !opaqueId(body.sessionId)) throw new HttpError("Invalid presence action");
    const signed = readContext(body.token);
    if (signed.excluded) return Response.json({ sessionToken: null });
    const result = await backend("presenceHeartbeat", {
      visitorHash: signed.visitorHash, pageId: `${signed.pageId}:${body.sessionId}`,
      city: signed.city ?? "", country: signed.region,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
