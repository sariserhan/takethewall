/* eslint-disable @next/next/no-img-element -- ImageResponse renders static image markup, not browser image elements. */
import { ImageResponse } from "next/og";
import sharp from "sharp";
import QRCode from "qrcode";
import { ownerBaseUrl } from "@/lib/owner-secrets";
import { getSharedTakeover } from "@/lib/shared-takeover";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "landscape";
  const formats: Record<string, { width: number; height: number }> = {
    landscape: { width: 1200, height: 630 },
    square: { width: 1080, height: 1080 },
    portrait: { width: 1080, height: 1350 },
  };
  if (!Object.hasOwn(formats, format))
    return new Response("Unknown card format", { status: 400 });
  const dimensions = formats[format],
    tall = format !== "landscape";
  const data = await getSharedTakeover(publicId);
  if (!data)
    return new Response("Takeover unavailable", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const qr = await QRCode.toDataURL(
    `${ownerBaseUrl()}/takeover/${publicId}?via=share`,
    {
      errorCorrectionLevel: "M",
      margin: 4,
      width: tall ? 220 : 160,
    },
  );
  let logo: string | undefined;
  if (data.owner.logoUrl) {
    try {
      const url = new URL(data.owner.logoUrl);
      if (
        url.hostname.endsWith(".convex.cloud") ||
        url.hostname === "127.0.0.1"
      ) {
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const bytes = new Uint8Array(await r.arrayBuffer());
          if (bytes.length <= 3 * 1024 * 1024)
            logo =
              "data:image/png;base64," +
              (
                await sharp(bytes)
                  .resize(180, 180, { fit: "inside" })
                  .png()
                  .toBuffer()
              ).toString("base64");
        }
      }
    } catch {}
  }
  const owner = data.owner;
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: 48,
        background: "#f4f3eb",
        color: "#11110f",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "3px solid #11110f",
          paddingBottom: 24,
        }}
      >
        <span style={{ fontSize: 38, fontWeight: 900 }}>TAKE THE WALL</span>
        <span style={{ fontSize: 28 }}>
          TAKEOVER{" "}
          {owner.takeoverNumber
            ? `#${owner.takeoverNumber.toLocaleString("en-US")}`
            : ""}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 32,
          alignItems: "center",
          flexDirection: tall ? "column" : "row",
        }}
      >
        {logo && (
          <img
            src={logo}
            width={150}
            height={150}
            alt=""
            style={{ objectFit: "contain" }}
          />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            ...(tall ? { width: "100%" } : { flex: 1 }),
            flexShrink: 0,
            textAlign: tall ? "center" : "left",
          }}
        >
          <span style={{ fontSize: 22 }}>I TOOK THE WALL.</span>
          <span
            style={{
              fontSize: owner.displayName.length > 35 ? 44 : tall ? 76 : 60,
              fontWeight: 900,
              overflowWrap: "break-word",
            }}
          >
            {owner.displayName || owner.domain}
          </span>
          {data.previousOwnerName && (
            <span style={{ fontSize: 22, overflowWrap: "break-word" }}>
              I replaced {data.previousOwnerName}.
            </span>
          )}
          <span style={{ fontSize: 27, color: "#68685f" }}>
            {owner.description}
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
          padding: "18px 22px",
          background: "#d8ff36",
          fontSize: 26,
          fontWeight: 700,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span>ONE WALL. ONE OWNER.</span>
          <span style={{ fontSize: 22 }}>Scan to view my takeover</span>
          <span style={{ fontSize: 22 }}>takethewall.com ↗</span>
        </div>
        <img
          src={qr}
          width={tall ? 220 : 160}
          height={tall ? 220 : 160}
          alt="QR code to public takeover"
        />
      </div>
    </div>,
    {
      ...dimensions,
      headers: {
        "Cache-Control": "no-store",
        ...(new URL(req.url).searchParams.get("download") === "1"
          ? {
              "Content-Disposition": `attachment; filename="takethewall-${owner.takeoverNumber ?? "share"}-${format}.png"`,
            }
          : {}),
      },
    },
  );
}
