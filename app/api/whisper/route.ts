import { backend, clientHash, failure, jsonBody, rate, sameOrigin } from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "whisper", 6);
    const a = await jsonBody(req);
    await backend("whisperPost", { takeoverId: a.takeoverId, text: String(a.text ?? ""), ipHash: clientHash(req), honeypot: String(a.company ?? "") });
    return Response.json({ ok: true });
  } catch (e) { return failure(e); }
}
