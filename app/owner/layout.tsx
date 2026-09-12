import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "Your owner dashboard — Take The Wall",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};
export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="owner-page">
      <header className="owner-page-header">
        <Link href="/">TAKE THE WALL</Link>
        <span>OWNER ACCESS</span>
      </header>
      {children}
      <footer className="owner-page-footer">
        <Link href="/">Back to the live wall</Link>
        <Link href="/?info=support">Support</Link>
      </footer>
    </main>
  );
}
