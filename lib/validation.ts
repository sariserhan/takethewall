import ipaddr from "ipaddr.js";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export function validateUrl(value: string) {
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("Enter a valid public HTTPS URL.");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid public HTTPS URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("Use HTTPS without credentials or a custom port.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const bare = host.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(bare)) {
    if (ipaddr.parse(bare).range() !== "unicast")
      throw new Error("Private and reserved destinations are not allowed.");
    // IPv6 literals are deliberately excluded to avoid mapped/transition network ambiguities.
    if (ipaddr.parse(bare).kind() === "ipv6")
      throw new Error("Use a public domain name.");
  } else if (
    !host.includes(".") ||
    host.length > 253 ||
    !host
      .split(".")
      .every((x) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(x)) ||
    /(?:^|\.)(localhost|local|internal|test|invalid|example|onion|lan|home|arpa)$/.test(
      host,
    )
  ) {
    throw new Error("Use a public website domain.");
  }
  url.hostname = host;
  return { websiteUrl: url.toString(), domain: host.replace(/^www\./, "") };
}
export function validateDescription(value: string) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    [...value.trim()].length > 120 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]|<[^>]*>/.test(value)
  )
    throw new Error("Use 1–120 characters of plain text.");
  return value.trim();
}
export function validateEmail(value: string) {
  if (typeof value !== "string")
    throw new Error("Enter a valid email address.");
  const email = value.trim();
  if (
    email.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
    email.split("@")[0].length > 64 ||
    /[\r\n]/.test(email)
  )
    throw new Error("Enter a valid email address.");
  return email;
}
export function validateFile(file: {
  name: string;
  type: string;
  size: number;
}) {
  const ext = file.name.toLowerCase().split(".").pop();
  const types: Record<string, string[]> = {
    "image/png": ["png"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/webp": ["webp"],
  };
  if (
    !ext ||
    !types[file.type]?.includes(ext) ||
    file.size < 1 ||
    file.size > MAX_IMAGE_BYTES
  )
    throw new Error("Choose a PNG, JPEG, or WEBP image up to 2 MB.");
}
export function validateContent(
  domain: string,
  description: string,
  blocked = "",
) {
  if (
    blocked
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .some((x) => domain === x || domain.endsWith("." + x)) ||
    /\b(steal (?:passwords|credentials)|buy stolen|child pornography|ransomware for sale|join isis)\b/i.test(
      description,
    )
  )
    throw new Error(
      "This advertisement is not allowed under our content policy.",
    );
}
export function safeDestination(value: string) {
  const u = new URL(value);
  return u.origin + u.pathname;
}
export function ctr(impressions: number, clicks: number) {
  return impressions ? (clicks / impressions) * 100 : 0;
}
export function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((x) => String(x).padStart(2, "0"))
    .join(":");
}
export function topRegions(
  rows: { regionCode: string; impressions: number }[],
) {
  const total = rows.reduce((a, r) => a + r.impressions, 0);
  const sorted = [...rows].sort((a, b) => b.impressions - a.impressions);
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4).reduce((a, r) => a + r.impressions, 0);
  return [
    ...top,
    ...(rest ? [{ regionCode: "Other", impressions: rest }] : []),
  ].map((r) => ({ ...r, percent: total ? (r.impressions / total) * 100 : 0 }));
}
export function excludedTraffic(
  userAgent: string,
  production: boolean,
  tagged: boolean,
) {
  return (
    !production ||
    tagged ||
    /bot|crawler|spider|headless|lighthouse|preview|slurp|facebookexternalhit/i.test(
      userAgent,
    )
  );
}
