import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, noarchive" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        source: "/reward/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.visitorping.com" +
              (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") +
              "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.convex.cloud http://127.0.0.1:*; connect-src 'self' https://*.convex.cloud https://*.convex.site wss://*.convex.cloud http://127.0.0.1:* ws://127.0.0.1:* https://ingest.visitorping.com; font-src 'self'; frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com; base-uri 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};
export default config;
