export function rewardStatus(status: string, inProgress = false) {
  const labels: Record<string, string> = {
    future: inProgress ? "In progress" : "Upcoming",
    selecting: "Evaluating referral traffic",
    unawarded: "Unawarded",
    pending_claim: "Awaiting claim",
    under_review: "Under review",
    approved: "Approved · Awaiting payout",
    paid: "Completed · Paid",
    awaiting_successor: "Awaiting next eligible recipient",
  };
  return labels[status] ?? "Under review";
}
