import { ImageResponse } from "next/og";
export const alt = "Take The Wall. One page. One owner. Who’s next?";
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
      <div style={{ fontSize: 42, letterSpacing: -1 }}>TAKE THE WALL</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 108,
          lineHeight: 1,
          letterSpacing: -5,
        }}
      >
        <div>ONE PAGE.</div>
        <div>ONE OWNER.</div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 60, letterSpacing: -2 }}>WHO’S NEXT? →</div>
        <div style={{ fontSize: 26 }}>takethewall.com</div>
      </div>
    </div>,
    size,
  );
}
