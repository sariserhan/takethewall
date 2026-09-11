import { ImageResponse } from "next/og";
export const alt = "TAKE THE WALL. $2.99. LAST PAYER OWNS IT.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        background: "#d8ff36",
        color: "#111",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "64px",
        fontFamily: "sans-serif",
        fontWeight: 900,
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontSize: 100, letterSpacing: -6 }}>TAKE THE WALL</div>
      <div style={{ fontSize: 180, lineHeight: 1 }}>$2.99</div>
      <div style={{ fontSize: 44 }}>LAST PAYER OWNS IT.</div>
    </div>,
    size,
  );
}
