/** One validated origin for canonical URLs and generated metadata. */
export function siteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      )
        return new URL(url.origin);
    } catch {
      /* Use the public origin when configuration is malformed. */
    }
  }
  return new URL("https://takethewall.com");
}
