import {
  backend,
  clientHash,
  failure,
  HttpError,
  jsonBody,
  sameOrigin,
} from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await jsonBody(req);
    // whisperPost enforces both per-client and per-room limits atomically.
    // Charging "whisper:<clientHash>" here too counted each message twice.
    await backend("whisperPost", {
      takeoverId: a.takeoverId,
      text: String(a.text ?? ""),
      ipHash: clientHash(req),
      honeypot: String(a.company ?? ""),
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof HttpError && e.status === 429)
      return Response.json(
        {
          error:
            "Whisper is sending too quickly. Please wait up to a minute and try again. Your message has been kept.",
        },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    return failure(e);
  }
}
