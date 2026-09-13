import { WallBlacklight } from "@/components/wall-blacklight";
import { WallPreferences } from "@/components/wall-preferences";
import { siteUrl } from "@/lib/site-url";
import type { Metadata, Viewport } from "next";
import "@fontsource/anton/latin-400.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "Take The Wall — One page. One owner. Who’s next?",
  description:
    "One public page, one owner at a time. See what’s on the wall and who takes over next.",
  referrer: "no-referrer",
  openGraph: {
    title: "Take The Wall — One page. One owner. Who’s next?",
    description:
      "One page. One owner. A project, a message, or something unexpected. See who owns the wall.",
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
      <body><WallPreferences /><WallBlacklight />{children}</body>
    </html>
  );
}
