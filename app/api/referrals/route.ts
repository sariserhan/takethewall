import { NextResponse } from "next/server";
import {
  backend,
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
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "referral", 30);
    const a = await jsonBody(req);
    if (
      typeof a.publicId !== "string" ||
      !/^ttw_[a-f0-9]{32}$/.test(a.publicId) ||
      !opaqueId(a.visitorId)
    )
      throw new HttpError("Invalid referral");
    const response = new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
    if (trafficContext(req).excluded) return response;
    const accepted = await backend<boolean>("referralVisit", {
      publicId: a.publicId,
      visitorHash: keyed("referral-visitor:" + a.visitorId),
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
