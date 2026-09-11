import { cookies } from "next/headers";
import {
  backend,
  clientHash,
  failure,
  jsonBody,
  randomToken,
  sameOrigin,
} from "@/lib/server";
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 12 * 3600,
};
export async function GET() {
  const session = (await cookies()).get("ttw-claim")?.value;
  if (!session)
    return Response.json(
      { session: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const valid = await backend<boolean>("claimSession", { session });
    return Response.json(
      { session: valid ? session : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ session: null }, { status: 401 });
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await jsonBody(req);
    if (a.action === "logout") {
      const jar = await cookies();
      const session = jar.get("ttw-claim")?.value;
      if (session) await backend("claimLogout", { session });
      jar.delete("ttw-claim");
      return Response.json({ ok: true });
    }
    if (typeof a.token !== "string" || !/^[a-f0-9]{64}$/.test(a.token))
      return Response.json({ error: "Invalid claim link" }, { status: 400 });
    if (a.action === "start") {
      await backend("claimStart", { token: a.token, ipHash: clientHash(req) });
      return Response.json(
        { ok: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (a.action !== "verify")
      return Response.json({ error: "Invalid request" }, { status: 400 });
    const session = randomToken();
    const ok = await backend<boolean>("claimVerify", {
      token: a.token,
      code: String(a.code ?? ""),
      session,
      ipHash: clientHash(req),
    });
    if (!ok)
      return Response.json(
        { error: "Code invalid, expired, or locked. Request a fresh code." },
        { status: 400 },
      );
    (await cookies()).set("ttw-claim", session, options);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
