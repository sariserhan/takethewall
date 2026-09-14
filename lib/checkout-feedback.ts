export const checkoutFeedbackReasons = [
  "Just exploring",
  "Not sure what to publish",
  "Price is too high",
  "Worried about being replaced too quickly",
  "Designing was difficult",
  "Something did not work",
  "Other",
] as const;
export type CheckoutFeedbackReason = (typeof checkoutFeedbackReasons)[number];
