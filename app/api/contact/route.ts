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
    await backend("supportSubmit", {
      name: a.name ?? "",
      email: a.email,
      topic: a.topic,
      message: a.message,
      honeypot: a.company ?? "",
      ipHash: clientHash(req),
    });
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
