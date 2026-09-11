export function visitorPingPayload(a: {
  siteKey: string;
  deliveryId: string;
  timestamp: number;
  event: string;
  takeoverId: string;
  domain: string;
  websiteUrl: string;
  visitorHash?: string;
  pageId?: string;
  region?: string;
}) {
  const u = a.websiteUrl ? new URL(a.websiteUrl) : null;
  return {
    siteId: a.siteKey,
    deliveryId: a.deliveryId,
    visitorId: a.visitorHash ?? "ttw-system-events",
    sessionId: a.pageId ?? "ttw-system:" + a.takeoverId,
    event: a.event,
    path: "/",
    referrer: "",
    timestamp: a.timestamp,
    data: {
      takeoverId: a.takeoverId,
      ownerDomain: a.domain,
      destination: u ? u.origin + u.pathname : "",
      ...(a.region ? { country: a.region } : {}),
    },
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
    text: `Your advertisement for ${a.domain} was activated at ${at} and ended at ${new Date(a.replacedAt ?? a.activatedAt).toISOString()}, after ${seconds} seconds. ${a.endReason === "moderation" ? "It was removed under our content policy." : "Another confirmed purchase took the wall."} This describes your recorded reign. View the current wall at https://takethewall.com.`,
  };
}
export const retryDelay = (attempt: number) =>
  Math.min(3600_000, 30_000 * 2 ** Math.max(0, attempt - 1));
