import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/takeover-sitemap-:id([0-9]+).xml",
        destination: "/takeover/sitemap/:id.xml",
      },
    ];
  },
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
        source: "/alerts",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        source: "/owner/:path*",
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
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.visitorping.com https://js.stripe.com https://*.js.stripe.com https://checkout.stripe.com" +
              (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") +
              "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.stripe.com https://*.link.com https://*.convex.cloud http://127.0.0.1:*; connect-src 'self' https://*.convex.cloud https://*.convex.site wss://*.convex.cloud http://127.0.0.1:* ws://127.0.0.1:* https://ingest.visitorping.com wss://realtime.visitorping.com https://api.stripe.com https://checkout.stripe.com https://js.stripe.com https://r.stripe.com https://m.stripe.network https://link.com https://*.link.com; frame-src https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com https://*.js.stripe.com https://link.com https://*.link.com; font-src 'self'; frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com; base-uri 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};
export default config;
