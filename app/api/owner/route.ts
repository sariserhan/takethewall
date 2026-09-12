import { cookies } from "next/headers";
import {
  backend,
  clientHash,
  failure,
  HttpError,
  jsonBody,
  rate,
  sameOrigin,
} from "@/lib/server";
import type { OwnerDashboard } from "@/lib/owner-types";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const token = (await cookies()).get("ttw-owner")?.value;
  if (!token)
    return Response.json(
      { dashboard: null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  try {
    await rate(req, "owner-dashboard", 90);
    return Response.json(
      { dashboard: await backend<OwnerDashboard>("ownerDashboard", { token }) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Could not open the private dashboard. Try your email link again.",
      },
      { status: 401 },
    );
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "owner-account", 20);
    const a = await jsonBody(req),
      jar = await cookies();
    if (a.action === "logout") {
      jar.delete("ttw-owner");
      return Response.json({ ok: true });
    }
    if (a.action === "request") {
      await backend("ownerRequestLink", {
        number: Number(a.number),
        email: String(a.email ?? ""),
        ipHash: clientHash(req),
      });
      return Response.json({ ok: true });
    }
    if (a.action === "login") {
      if (typeof a.token !== "string" || !/^[a-f0-9]{64}$/.test(a.token))
        throw new HttpError("Invalid private link");
      const dashboard = await backend<OwnerDashboard>("ownerDashboard", {
        token: a.token,
      });
      jar.set("ttw-owner", a.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 30 * 86400,
      });
      return Response.json({ dashboard });
    }
    if (a.action === "preferences") {
      const token = jar.get("ttw-owner")?.value;
      if (!token)
        throw new HttpError("Open your private email link first.", 401);
      if (typeof a.weeklyDigestEnabled !== "boolean")
        throw new HttpError("Invalid preference");
      await backend("ownerPreferences", {
        token,
        weeklyDigestEnabled: a.weeklyDigestEnabled,
      });
      return Response.json({ ok: true });
    }
    throw new HttpError("Unknown action");
  } catch (error) {
    return failure(error);
  }
}
