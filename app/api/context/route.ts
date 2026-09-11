import {
  backend,
  failure,
  HttpError,
  jsonBody,
  keyed,
  opaqueId,
  rate,
  sameOrigin,
  signContext,
  trafficContext,
} from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "context", 90);
    const a = await jsonBody(req);
    if (
      !opaqueId(a.visitorId) ||
      !opaqueId(a.pageId) ||
      !opaqueId(a.takeoverId)
    )
      throw new HttpError("Invalid event request");
    await backend("context", { takeoverId: a.takeoverId });
    const issuedAt = Date.now(),
      expiresAt = issuedAt + 300_000;
    return Response.json(
      {
        token: signContext({
          takeoverId: a.takeoverId,
          visitorHash: keyed("visitor:" + a.visitorId),
          pageId: a.pageId,
          ...trafficContext(req),
          issuedAt,
          expiresAt,
        }),
        expiresAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
