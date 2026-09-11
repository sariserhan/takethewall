import { backend, env } from "@/lib/server";
import { getStripe, verifiedSession, verifiedExpiration } from "@/lib/stripe";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      await req.text(),
      signature,
      env("STRIPE_WEBHOOK_SECRET"),
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    const data = verifiedSession(
      event,
      process.env.WALL_ENVIRONMENT === "production",
    );
    if (data) await backend("activate", data);
    const expired = verifiedExpiration(
      event,
      process.env.WALL_ENVIRONMENT === "production",
    );
    if (expired) await backend("expire", expired);
    return Response.json({ received: true });
  } catch {
    return new Response("Payment processing failed; retry delivery", {
      status: 500,
    });
  }
}
