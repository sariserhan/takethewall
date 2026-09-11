import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "TakeTheWall Reward Claim",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="document-page">
      <Link href="/">TAKE THE WALL</Link>
      {children}
      <Link href="/support">Need help?</Link>
    </main>
  );
}
