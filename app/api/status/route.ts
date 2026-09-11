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
    return Response.json(await backend("status", { tokenHash: hash(token) }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
