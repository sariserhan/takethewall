import { visitorPingProperties } from "@/lib/delivery";
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
    const owner = await backend<{
      id: string;
      domain: string;
      websiteUrl: string;
    }>("context", { takeoverId: a.takeoverId });
    const traffic = trafficContext(req);
    const issuedAt = Date.now(),
      expiresAt = issuedAt + 300_000;
    return Response.json(
      {
        token: signContext({
          takeoverId: a.takeoverId,
          visitorHash: keyed("visitor:" + a.visitorId),
          pageId: a.pageId,
          ...traffic,
          issuedAt,
          expiresAt,
        }),
        expiresAt,
        visitorPing: traffic.excluded
          ? null
          : visitorPingProperties({
              takeoverId: owner.id,
              domain: owner.domain,
              websiteUrl: owner.websiteUrl,
              region: traffic.region,
            }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
