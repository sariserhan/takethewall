import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { failure, jsonBody, rate, sameOrigin } from "@/lib/server";
import { recoverPayment } from "@/lib/payment-recovery";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await fetchAuthQuery(api.admin.identity, {});
    await rate(req, "admin-payment-recovery", 10);
    const a = await jsonBody(req);
    const p = await fetchAuthQuery(api.deliveryAdmin.payment, {
      takeoverId: String(a.takeoverId) as Id<"takeovers">,
    });
    const paid = await recoverPayment(p.sessionId, p.takeoverId);
    return Response.json(
      {
        message: paid
          ? "Stripe confirmed payment. The takeover is activated; email delivery is queued."
          : "Stripe has not confirmed payment. Nothing was published.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
