/** Sender addresses belong to the verified takethewall.com domain. */
export type EmailPurpose =
  | "account"
  | "notifications"
  | "digest"
  | "alerts"
  | "rewards"
  | "support"
  | "contact";
export type EmailSender = { from: string; reply_to?: string };
const names: Record<EmailPurpose, string> = {
  account: "Account",
  notifications: "Notifications",
  digest: "Weekly Digest",
  alerts: "Milestone Alerts",
  rewards: "Rewards",
  support: "Support",
  contact: "Contact",
};
export function emailSender(purpose: EmailPurpose): EmailSender {
  return {
    from: `Take The Wall — ${names[purpose]} <${purpose}@takethewall.com>`,
    reply_to: `${purpose === "rewards" || purpose === "contact" ? purpose : "support"}@takethewall.com`,
  };
}
export function senderForMail(mail: {
  kind: string;
  claimId?: string;
  ticketId?: string;
}): EmailSender {
  if (["admin_otp", "otp", "owner_access_email", "checkout_resume_email"].includes(mail.kind))
    return emailSender("account");
  if (
    ["activation_email", "replacement_email", "admin_takeover_email", "admin_payment_failure_email"].includes(
      mail.kind,
    )
  )
    return emailSender("notifications");
  if (["wall_confirm", "wall_change", "wall_daily"].includes(mail.kind))
    return emailSender("notifications");
  if (mail.kind === "weekly_digest_email") return emailSender("digest");
  if (["milestone_confirm", "milestone_alert"].includes(mail.kind))
    return emailSender("alerts");
  if (mail.claimId || mail.kind === "reward_support")
    return emailSender("rewards");
  if (mail.kind === "contact") return emailSender("contact");
  if (mail.ticketId || mail.kind === "support") return emailSender("support");
  return emailSender("contact");
}
/** Retain the old request's headers for in-flight retries across this rollout. */
export function legacyEmailSender(
  transactional: boolean,
): EmailSender | undefined {
  if (!process.env.RESEND_FROM) return undefined;
  return {
    from: process.env.RESEND_FROM,
    ...(transactional
      ? { reply_to: process.env.SUPPORT_EMAIL ?? "support@takethewall.com" }
      : {}),
  };
}
