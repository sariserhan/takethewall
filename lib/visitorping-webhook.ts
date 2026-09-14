export type VisitorPingAlert = {
  event: "visitor.arrival" | "visitor.hot_lead";
  data: {
    siteName: string;
    siteDomain: string;
    location: { city: string; region: string; country: string };
    source: string;
    entryPage: string;
    deviceType: string;
    isHotLead: boolean;
    companyName: string;
  };
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Expected an object");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, optional = false) {
  if (optional && (value === undefined || value === null)) return "";
  if (typeof value !== "string" || value.length > max)
    throw Error("Invalid text field");
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
export function parseVisitorPingAlert(value: unknown): VisitorPingAlert {
  const root = object(value),
    data = object(root.data),
    location = object(data.location ?? {});
  if (root.event !== "visitor.arrival" && root.event !== "visitor.hot_lead")
    throw Error("Unsupported event");
  const domain = text(data.siteDomain, 253)
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  if (domain !== "takethewall.com") throw Error("Unexpected site domain");
  if (typeof data.isHotLead !== "boolean") throw Error("Invalid hot-lead flag");
  return {
    event: root.event,
    data: {
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
      entryPage: safePage(text(data.entryPage, 2048, true)),
      deviceType: text(data.deviceType, 80, true),
      isHotLead: data.isHotLead,
      companyName: text(data.companyName, 240, true),
    },
  };
}
