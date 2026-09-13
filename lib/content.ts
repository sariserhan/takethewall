import { parseWallDesign } from "./wall-design";
import { validateMorseMessage } from "./morse";
import { validateUrl, validateContent } from "./validation";
export const linkTypes = [
  "website",
  "ios_app",
  "android_app",
  "instagram",
  "tiktok",
  "youtube",
  "x",
  "linkedin",
  "other",
] as const;
export type LinkType = (typeof linkTypes)[number];
export function plainText(
  value: unknown,
  max: number,
  required = true,
  multiline = false,
) {
  if (
    typeof value !== "string" ||
    (required && !value.trim()) ||
    [...value.trim()].length > max ||
    (multiline
      ? /[\x00-\x08\x0b\x0c\x0e-\x1f]|<[^>]*>/
      : /[\x00-\x1f]|<[^>]*>/
    ).test(value)
  )
    throw new Error(
      `Use ${required ? "1" : "0"}–${max} characters of plain text.`,
    );
  return value.trim();
}
export function detectLinkType(url: string): LinkType {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const types: Record<string, LinkType> = {
    "apps.apple.com": "ios_app",
    "play.google.com": "android_app",
    "instagram.com": "instagram",
    "tiktok.com": "tiktok",
    "youtube.com": "youtube",
    "youtu.be": "youtube",
    "x.com": "x",
    "twitter.com": "x",
    "linkedin.com": "linkedin",
  };
  return types[host] ?? "website";
}
export const contentCta = (type?: string) =>
  ({
    website: "VISIT WEBSITE",
    ios_app: "VIEW ON APP STORE",
    android_app: "GET THE APP",
    instagram: "VIEW INSTAGRAM",
    tiktok: "VIEW TIKTOK",
    youtube: "VIEW CHANNEL",
    x: "VIEW ON X",
    linkedin: "VIEW LINKEDIN",
    other: "VISIT LINK",
  })[type as LinkType] ?? "VISIT WEBSITE";
export function validateWallContent(a: {
  contentType?: string;
  websiteUrl: string;
  displayName?: string;
  description: string;
  morseMessage?: string;
  canvasDesign?: string;
  linkType?: string;
}) {
  if (a.contentType && !["personal", "link"].includes(a.contentType))
    throw new Error("Choose a content type.");
  const personal = a.contentType === "personal";
  const url = personal
    ? { websiteUrl: "", domain: "" }
    : validateUrl(a.websiteUrl);
  const displayName = plainText(
    a.displayName || (personal ? "" : url.domain),
    60,
  );
  const design = parseWallDesign(a.canvasDesign);
  const canvasDesign = design ? JSON.stringify(design) : undefined;
  const morseMessage = validateMorseMessage(a.morseMessage);
  const description = plainText(a.description, 120, false);
  const linkType = personal ? "other" : detectLinkType(url.websiteUrl);
  validateContent(
    url.domain,
    displayName +
      " " +
      description +
      " " +
      morseMessage +
      " " +
      (design?.blocks.map((b) => b.text).join(" ") ?? ""),
    process.env.BLOCKED_DOMAINS,
  );
  for (const block of design?.blocks ?? [])
    if (block.href)
      validateContent(
        new URL(block.href).hostname,
        block.text,
        process.env.BLOCKED_DOMAINS,
      );
  return {
    ...url,
    contentType: personal ? ("personal" as const) : ("link" as const),
    linkType:
      a.linkType === "other" && linkType === "website"
        ? ("other" as const)
        : linkType,
    displayName,
    description,
    ...(canvasDesign ? { canvasDesign } : {}),
    ...(morseMessage ? { morseMessage } : {}),
  };
}
