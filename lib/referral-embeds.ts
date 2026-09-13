const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
export function referralEmbeds(publicId: string, origin: string | URL) {
  const path = `/takeover/${encodeURIComponent(publicId)}`;
  const href = new URL(`/?ref=${encodeURIComponent(publicId)}&via=share`, origin).href;
  const src = new URL(`${path}/badge`, origin).href;
  const link = escapeHtml(href),
    image = escapeHtml(src);
  const imageTag = `<img src="${image}" alt="See my TakeTheWall placement" width="400" height="64" style="display:block;width:100%;max-width:400px;height:auto;border:0;" />`;
  return {
    href,
    src,
    formats: {
      banner: `<a href="${link}" target="_blank" rel="noopener noreferrer" aria-label="Visit my TakeTheWall placement" style="display:flex;justify-content:center;align-items:center;box-sizing:border-box;width:100%;padding:16px;background:#11110f;border-radius:8px;text-decoration:none;">${imageTag}</a>`,
      footer: `<a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:8px 12px;background:#d8ff36;color:#11110f;font:600 13px/1.5 Arial,sans-serif;text-decoration:none;border-radius:4px;">See my takeover on TakeTheWall &#8599;</a>`,
      html: `<a href="${link}" target="_blank" rel="noopener noreferrer">${imageTag}</a>`,
      markdown: `[![My TakeTheWall placement](${src})](${href})`,
    },
  };
}
