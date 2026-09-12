import { visitorPingProperties } from "@/lib/delivery";
import { trafficContext } from "@/lib/server";
import {
  backend,
  failure,
  hash,
  HttpError,
  jsonBody,
  opaqueId,
  rate,
  sameOrigin,
} from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "status", 40);
    const { token } = await jsonBody(req);
    if (!opaqueId(token)) throw new HttpError("Invalid confirmation token");
    const result = await backend<{
      state: string;
      analyticsAllowed?: boolean;
      owner: { id: string; domain: string; websiteUrl: string } | null;
    }>("status", { tokenHash: hash(token) });
    const visitorPing =
      result.analyticsAllowed &&
      !trafficContext(req).excluded &&
      ["active", "replaced"].includes(result.state) &&
      result.owner
        ? visitorPingProperties({
            takeoverId: result.owner.id,
            domain: result.owner.domain,
            websiteUrl: result.owner.websiteUrl,
          })
        : null;
    return Response.json(
      { ...result, visitorPing },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
