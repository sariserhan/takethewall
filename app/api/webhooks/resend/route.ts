import { Webhook } from "svix";
import { backend, boundedBody } from "@/lib/server";
import { resendEventTypes } from "@/lib/resend-events";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook unavailable", { status: 503 });
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!id || !timestamp || !signature)
    return new Response("Missing signature", { status: 400 });
  type DeliveryEvent = {
    type?: unknown;
    created_at?: unknown;
    data?: { email_id?: unknown; bounce?: { type?: unknown } };
  };
  let event: DeliveryEvent;
  try {
    const payload = new TextDecoder().decode(
      await boundedBody(req, 256 * 1024),
    );
    new Webhook(secret).verify(payload, {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    });
    event = JSON.parse(payload) as DeliveryEvent;
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }
  if (!event || typeof event.type !== "string")
    return new Response("Invalid event", { status: 400 });
  // Inbound emails are not ingested: their content is unrelated to delivery tracking.
  if (!resendEventTypes.some((type) => type === event.type))
    return Response.json({ received: true, ignored: true });
  if (
    typeof event.data?.email_id !== "string" ||
    event.data.email_id.length > 100 ||
    id.length > 200 ||
    typeof event.created_at !== "string" ||
    !Number.isFinite(Date.parse(event.created_at))
  )
    return new Response("Invalid event", { status: 400 });
  try {
    await backend("emailDelivery", {
      eventId: id,
      emailId: event.data.email_id,
      type: event.type,
      occurredAt: Date.parse(event.created_at),
      ...(typeof event.data?.bounce?.type === "string"
        ? { bounceType: event.data.bounce.type.slice(0, 40) }
        : {}),
    });
    return Response.json({ received: true });
  } catch {
    return new Response("Delivery recording failed; retry", { status: 500 });
  }
}
