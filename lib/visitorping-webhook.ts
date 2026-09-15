export type VisitorPingAlert = {
  event: "visitor.arrival" | "visitor.hot_lead";
  data: {
    siteName: string;
    siteDomain: string;
    location: { city: string; region: string; country: string };
    source: string;
    entryPage: string;
    referralPublicId?: string;
    sessionId?: string;
    visitorId?: string;
    visitorNumber?: number;
    timestamp?: string;
    deviceType: string;
    isHotLead: boolean;
    companyName: string;
  };
};
export class VisitorPingValidationError extends Error {}
export function parseVisitorNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new VisitorPingValidationError("Invalid visitor number");
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new VisitorPingValidationError("Expected an object");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, optional = false) {
  if (optional && (value === undefined || value === null)) return "";
  if (typeof value !== "string" || value.length > max)
    throw new VisitorPingValidationError("Invalid text field");
  return value.trim();
}
// Alert URLs may include private checkout/claim query strings. Never persist them.
function safePage(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value, "https://takethewall.com");
    if (!["http:", "https:"].includes(url.protocol)) return "";
    const path = url.pathname.replace(
      /\/reward\/claim\/[^/]+/g,
      "/reward/claim/[redacted]",
    );
    return url.origin + path;
  } catch {
    return "";
  }
}
// Preserve only the public tracked-link ID before discarding URL query data.
export function trackedReferralId(value: string): string | undefined {
  try {
    const url = new URL(value, "https://takethewall.com");
    if (!["https:", "http:"].includes(url.protocol) || !["takethewall.com", "www.takethewall.com"].includes(url.hostname) || url.username || url.password) return;
    const refs = url.searchParams.getAll("ref");
    if (refs.length === 1 && /^ttw_[a-f0-9]{32}$/.test(refs[0])) return refs[0];
  } catch {}
}
export function parseVisitorPingAlert(value: unknown): VisitorPingAlert {
  const root = object(value),
    data = object(root.data),
    location = object(data.location ?? {});
  if (root.event !== "visitor.arrival" && root.event !== "visitor.hot_lead")
    throw new VisitorPingValidationError("Unsupported event");
  const domain = text(data.siteDomain, 253)
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  if (domain !== "takethewall.com")
    throw new VisitorPingValidationError("Unexpected site domain");
  if (typeof data.isHotLead !== "boolean")
    throw new VisitorPingValidationError("Invalid hot-lead flag");
  const visitorNumber = parseVisitorNumber(data.visitorNumber);
  const entryPage = text(data.entryPage, 2048, true);
  const fromUrl = trackedReferralId(entryPage);
  const preserved = typeof data.referralPublicId === "string" && /^ttw_[a-f0-9]{32}$/.test(data.referralPublicId) ? data.referralPublicId : undefined;
  const referralPublicId = fromUrl ?? preserved;
  return {
    event: root.event,
    data: {
      ...Object.fromEntries(["sessionId", "visitorId", "timestamp"].flatMap(key => {
        if (data[key] === undefined) return [];
        const value = text(data[key], 200);
        if (!value || (key === "timestamp" && !Number.isFinite(Date.parse(value)))) throw new VisitorPingValidationError("Invalid arrival identity or timestamp");
        return [[key, value]];
      })),
      ...(visitorNumber !== undefined ? { visitorNumber } : {}),
      siteDomain: domain,
      siteName: text(data.siteName, 200),
      location: {
        city: text(location.city, 160, true),
        region: text(location.region, 160, true),
        country: text(location.country, 160, true),
      },
      source: /^https?:\/\//i.test(String(data.source ?? ""))
        ? safePage(text(data.source, 2048, true))
        : text(data.source, 200, true),
      entryPage: safePage(entryPage),
      ...(referralPublicId ? { referralPublicId } : {}),
      deviceType: text(data.deviceType, 80, true),
      isHotLead: data.isHotLead,
      companyName: text(data.companyName, 240, true),
    },
  };
}
