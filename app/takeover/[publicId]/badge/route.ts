import { getSharedTakeover } from "@/lib/shared-takeover";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  const data = await getSharedTakeover(publicId);
  if (!data)
    return new Response("Takeover unavailable", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const label = data.active ? "REIGNING NOW" : "PAST OWNER";
  const number =
    Number.isSafeInteger(data.owner.takeoverNumber) &&
    data.owner.takeoverNumber! > 0
      ? ` #${data.owner.takeoverNumber}`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="64" viewBox="0 0 400 64" role="img" aria-label="Take The Wall${number}: ${label}"><title>Take The Wall${number}: ${label}</title><rect width="400" height="64" rx="8" fill="#11110f"/><rect x="232" y="1" width="167" height="62" rx="7" fill="${data.active ? "#d8ff36" : "#e1dfd4"}"/><g font-family="Arial,sans-serif" font-weight="700"><text x="16" y="28" fill="#f4f3eb" font-size="17">TAKE THE WALL</text><text x="16" y="48" fill="#f4f3eb" font-size="12">${number ? "TAKEOVER" + number : "ONE WALL. ONE OWNER."}</text><text x="316" y="37" fill="#11110f" font-size="14" text-anchor="middle">${label}</text></g></svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=60, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
