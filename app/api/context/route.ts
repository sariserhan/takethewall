import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { readReferralBrowser, REFERRAL_BROWSER_COOKIE } from "@/lib/referral-proof";
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
    const jar = new NextRequest(req.url, { headers: req.headers }).cookies;
    const referral = !traffic.excluded && typeof a.referralPublicId === "string" && /^ttw_[a-f0-9]{32}$/.test(a.referralPublicId) ? {
      publicId: a.referralPublicId,
      visitorHash: readReferralBrowser(jar.get(REFERRAL_BROWSER_COOKIE)?.value) ?? keyed("referral-visitor:" + a.visitorId),
      ...(jar.get("ttw-owner")?.value ? { ownerTokenHash: createHash("sha256").update(jar.get("ttw-owner")!.value).digest("hex") } : {}),
    } : undefined;
    const issuedAt = Date.now(),
      expiresAt = issuedAt + 300_000;
    return Response.json(
      {
        token: signContext({
          takeoverId: a.takeoverId,
          visitorHash: keyed("visitor:" + a.visitorId),
          pageId: a.pageId,
          ...traffic,
          ...(referral ? { referral } : {}),
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
