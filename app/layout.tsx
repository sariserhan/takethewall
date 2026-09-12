import { siteUrl } from "@/lib/site-url";
import type { Metadata, Viewport } from "next";
import "@fontsource/anton/latin-400.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "Take The Wall — One Wall. One Owner. $3.99.",
  description:
    "Pay $3.99 and take over the only ad on the page. Keep it until somebody else pays $3.99.",
  referrer: "no-referrer",
  openGraph: {
    title: "Take The Wall — One Wall. One Owner. $3.99.",
    description: "Pay $3.99. Take the wall. Keep it until someone else does.",
    type: "website",
    siteName: "Take The Wall",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { themeColor: "#dfff00" };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
