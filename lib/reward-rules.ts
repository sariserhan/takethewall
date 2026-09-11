import { MILESTONES, LEGAL_VERSION } from "./config";
export const DEFAULT_RULES = {
  version: LEGAL_VERSION,
  milestones: MILESTONES,
  currency: "USD",
  initialClaimDays: 7,
  additionalInformationDays: 7,
  purchase:
    "One $3.99 USD purchase activates one public placement after verified payment. Checkout does not reserve a number. No duration, traffic, clicks or results are guaranteed.",
  ordering:
    "Paid takeover numbers follow atomic successful activation order. House and moderation restorations do not count.",
  recipients:
    "A milestone activation creates a provisional recipient. Ineligible or expired candidates cascade strictly to the next paid takeover, without random selection, arbitrary skipping or maximum distance. One takeover may receive multiple rewards.",
  availability:
    "TakeTheWall is available globally. Milestone rewards are available wherever participation, verification, and payout are permitted by applicable law and our payment and payout providers.",
  claims:
    "Submit an initial claim within seven calendar days. Internal review does not consume a claimant deadline. Additional information has a separate seven-day deadline. Audited extensions are possible.",
  eligibility:
    "Eligibility requires operator review, valid purchase, truthful information, required age and residence eligibility, necessary identity/tax documentation, rules acceptance and an available lawful payout route. Applicable legal, sanctions and provider restrictions apply. No universal eligibility is promised.",
  payout:
    "Approved rewards are paid externally by manual wire in USD. Sent is distinct from confirmed. The announced reward is the gross USD amount; legally required withholding and recipient/intermediary bank fees may affect the net received. Applicable taxes remain the recipient's responsibility. Any required deductions are disclosed before payout confirmation.",
  disputes:
    "Refunds, chargebacks and fraud before payout disqualify the candidate and trigger succession. After payout they create an administrative review; there is no automatic clawback.",
  trophy:
    "Eligibility approval and confirmed payout publish the permanent content snapshot. Original-reign statistics remain live until replacement plus the two-minute late-event window, then freeze. Future purchases cannot change it. Unsafe outbound links can be disabled without removing the historical trophy. Permanent placement means continued historical publication for the operating life of TakeTheWall, subject to mandatory legal obligations.",
  audit:
    "Canonical SHA-256 records link paid activations in order. Independently retained or externally anchored checkpoints help detect later modification. Hashing does not independently prove fair payment ordering.",
};
export interface EligibilityProvider {
  getRequirements(input: {
    country: string;
    region?: string;
    prizeUsd: number;
  }): { requiredActions: string[]; automaticApproval: false };
}
export const operatorEligibility: EligibilityProvider = {
  getRequirements: () => ({
    requiredActions: [
      "Operator eligibility review",
      "Reward Rules acceptance",
      "Lawful payout arrangement",
    ],
    automaticApproval: false,
  }),
};
