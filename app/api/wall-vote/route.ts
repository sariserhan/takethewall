import { cookies } from "next/headers";
import {
  backend,
  clientHash,
  failure,
  HttpError,
  jsonBody,
  keyed,
  randomToken,
  rate,
  sameOrigin,
} from "@/lib/server";
const headers = { "Cache-Control": "private, no-store" };
const valid = (value: string | undefined) =>
  !!value && /^[A-Za-z0-9_-]{43}$/.test(value);
export async function GET(req: Request) {
  try {
    await rate(req, "wall-vote-read", 60);
    const token = (await cookies()).get("ttw-voter")?.value;
    const takeoverId = new URL(req.url).searchParams.get("takeoverId");
    if (!takeoverId) throw new HttpError("Missing takeover.");
    const choice = valid(token)
      ? await backend("wallVoteMine", {
          takeoverId,
          voterHash: keyed("wall-voter:" + token),
        })
      : null;
    return Response.json({ choice }, { headers });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "wall-vote-write", 30);
    const a = await jsonBody(req);
    if (
      !["keep", "yeet"].includes(a.choice) ||
      typeof a.takeoverId !== "string"
    )
      throw new HttpError("Choose Keep or Yeet.");
    const jar = await cookies();
    const old = jar.get("ttw-voter")?.value;
    const token = valid(old) ? old! : randomToken();
    const choice = await backend("wallVoteCast", {
      takeoverId: a.takeoverId,
      choice: a.choice,
      voterHash: keyed("wall-voter:" + token),
      ipHash: clientHash(req),
    });
    jar.set("ttw-voter", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 365 * 86400,
    });
    return Response.json({ choice }, { headers });
  } catch (e) {
    return failure(e);
  }
}
