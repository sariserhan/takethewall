export function parseTakeCommand(input: string) {
  if (input.length > 600) throw new Error("Command too long.");
  const match =
    /^take\s+--title\s+"([^"\r\n]{1,80})"(?:\s+--url\s+"([^"\r\n]{1,400})")?(?:\s+--pay)?\s*$/.exec(
      input,
    );
  if (!match || !match[1].trim())
    throw new Error(
      'Use: take --title "My project" --url "https://example.com" (--url is optional).',
    );
  let websiteUrl = "";
  if (match[2]) {
    let url: URL;
    try {
      url = new URL(match[2]);
    } catch {
      throw new Error("Enter a valid https:// or http:// URL.");
    }
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Use a public HTTP(S) URL without credentials.");
    websiteUrl = url.href;
  }
  return { displayName: match[1].trim(), websiteUrl };
}
