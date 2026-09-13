import { backend } from "./server";
import type { verifiedSession } from "./stripe";
export async function activatePayment(
  data: NonNullable<ReturnType<typeof verifiedSession>>,
) {
  try {
    await backend("activate", data);
  } catch (error) {
    try {
      await backend("paidPublicationFailure", {
        takeoverId: data.takeoverId,
        sessionId: data.sessionId,
        paymentIntentId: data.paymentIntentId,
        livemode: data.livemode,
      });
    } catch {
      console.error(
        "Paid publication failure alert could not be queued; webhook/recovery must retry",
        { takeoverId: data.takeoverId, sessionId: data.sessionId },
      );
    }
    throw error;
  }
}
