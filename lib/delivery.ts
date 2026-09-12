export function visitorPingProperties(a: {
  takeoverId: string;
  domain: string;
  websiteUrl: string;
  region?: string;
}) {
  const u = a.websiteUrl ? new URL(a.websiteUrl) : null;
  return {
    takeoverId: a.takeoverId,
    ownerDomain: a.domain,
    destination: u ? u.origin + u.pathname : "",
    ...(a.region ? { country: a.region } : {}),
  };
}
export function emailMessage(a: {
  kind: string;
  domain: string;
  activatedAt: number;
  replacedAt?: number;
  endReason?: string;
}) {
  const at = new Date(a.activatedAt).toISOString();
  if (a.kind === "activation_email")
    return {
      subject: "Your takeover was activated",
      text: `Your advertisement for ${a.domain} was activated on Take The Wall at ${at}. This confirms the recorded activation; someone else may already have taken the wall. There is no minimum duration, traffic, or click guarantee. View the current wall at https://takethewall.com.`,
    };
  const seconds = Math.max(
    0,
    Math.floor(((a.replacedAt ?? a.activatedAt) - a.activatedAt) / 1000),
  );
  return {
    subject: "Your takeover ended",
    text: `Your advertisement for ${a.domain} was activated at ${at} and ended at ${new Date(a.replacedAt ?? a.activatedAt).toISOString()}, after ${seconds} seconds. ${a.endReason === "moderation" ? "It was removed under our content policy." : a.endReason === "admin" ? "An administrator published a new wall placement." : "Another confirmed purchase took the wall."} This describes your recorded reign. View the current wall at https://takethewall.com.`,
  };
}
export const retryDelay = (attempt: number) =>
  Math.min(3600_000, 30_000 * 2 ** Math.max(0, attempt - 1));
