import {
  backend,
  clientHash,
  failure,
  jsonBody,
  sameOrigin,
} from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await jsonBody(req);
    await backend("contentReport", {
      takeoverId: a.takeoverId,
      reason: a.reason,
      details: a.details,
      email: a.email ?? "",
      honeypot: a.company ?? "",
      ipHash: clientHash(req),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
