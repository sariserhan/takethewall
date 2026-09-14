import {
  backend,
  failure,
  HttpError,
  jsonBody,
  opaqueId,
  rate,
  readContext,
  sameOrigin,
} from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "ingestion", 180);
    const a = await jsonBody(req);
    if (
      !opaqueId(a.eventId) ||
      ![
        "impression",
        "click",
        "take_wall_clicked",
        "checkout_started",
      ].includes(a.event)
    )
      throw new HttpError("Invalid event");
    const context = readContext(a.token);
    await backend("event", { ...context, eventId: a.eventId, event: a.event, source: "vercel" });
    return new Response(null, { status: 204 });
  } catch (e) {
    return failure(e);
  }
}
