import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  backend,
  clientHash,
  failure,
  HttpError,
  jsonBody,
  keyed,
  opaqueId,
  rate,
  sameOrigin,
  trafficContext,
} from "@/lib/server";
import { REFERRAL_COOKIE, REFERRAL_AGE, signReferral } from "@/lib/referral";
import {
  checkReferralProof,
  readReferralBrowser,
  REFERRAL_BROWSER_COOKIE,
  REFERRAL_WAIT_MS,
  signReferralBrowser,
  signReferralProof,
} from "@/lib/referral-proof";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "referral", 30);
    const a = await jsonBody(req);
    if (
      typeof a.publicId !== "string" ||
      !/^ttw_[a-f0-9]{32}$/.test(a.publicId)
    )
      throw new HttpError("Invalid referral");
    const response = new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
    if (trafficContext(req).excluded) return response;
    const jar = await cookies();
    const existing = readReferralBrowser(
      jar.get(REFERRAL_BROWSER_COOKIE)?.value,
    );
    if (a.action === "begin") {
      if (!opaqueId(a.visitorId))
        throw new HttpError("Invalid browser identity");
      // Preserve historical deduplication, then pin that identity in a signed,
      // HttpOnly cookie so changing localStorage cannot rotate it each visit.
      const visitorHash = existing ?? keyed("referral-visitor:" + a.visitorId);
      let visitorPingReferral: string | undefined;
      try {
        const token = randomBytes(32).toString("hex");
        await backend("referralPrepare", {
          tokenHash: createHash("sha256").update(token).digest("hex"),
          publicId: a.publicId, visitorHash,
          ...(jar.get("ttw-owner")?.value ? { ownerTokenHash: createHash("sha256").update(jar.get("ttw-owner")!.value).digest("hex") } : {}),
        });
        visitorPingReferral = token;
      } catch { /* Direct verification remains available if fallback setup fails. */ }
      const result = NextResponse.json(
        {
          proof: signReferralProof(a.publicId, visitorHash, clientHash(req)),
          waitMs: REFERRAL_WAIT_MS,
          ...(visitorPingReferral ? { visitorPingReferral } : {}),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
      result.cookies.set(
        REFERRAL_BROWSER_COOKIE,
        signReferralBrowser(visitorHash),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 365 * 86400,
        },
      );
      return result;
    }
    if (
      a.action !== "complete" ||
      !existing ||
      !checkReferralProof(a.proof, a.publicId, existing, clientHash(req))
    )
      throw new HttpError(
        "Visit verification expired. Open the shared link again.",
        403,
      );
    const accepted = await backend<boolean>("referralVisit", {
      publicId: a.publicId,
      visitorHash: existing,
      ...(jar.get("ttw-owner")?.value
        ? { ownerToken: jar.get("ttw-owner")!.value }
        : {}),
    });
    if (accepted)
      response.cookies.set(REFERRAL_COOKIE, signReferral(a.publicId), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: REFERRAL_AGE,
      });
    return response;
  } catch (e) {
    return failure(e);
  }
}
