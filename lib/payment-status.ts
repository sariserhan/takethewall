export function paymentStatus(
  kind: string,
  purchase?: {
    paidAt?: number;
    issuedAt?: number;
    expiredConfirmed?: boolean;
    paymentIssue?: string;
    stripeStatus?: string;
  } | null,
) {
  if (purchase?.paymentIssue === "refunded") return "Refunded";
  if (purchase?.paymentIssue === "chargeback") return "Disputed";
  if (purchase?.paidAt !== undefined) return "Paid";
  if (purchase?.issuedAt !== undefined || kind !== "paid")
    return "No payment required";
  if (purchase?.stripeStatus === "paid") return "Paid — publication pending";
  if (purchase?.expiredConfirmed || purchase?.stripeStatus === "expired")
    return "Expired";
  if (purchase?.stripeStatus === "processing") return "Payment processing";
  return "Awaiting payment";
}
export function placementType(kind: string) {
  return (
    {
      paid: "Checkout purchase",
      admin_counted: "Counted placement",
      admin_placement: "House placement",
      initial_house: "Initial house placement",
      moderation_restoration: "Restored placement",
    }[kind] ?? kind
  );
}
