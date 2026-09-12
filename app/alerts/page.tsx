import type { Metadata } from "next";
import Link from "next/link";
import { AlertManagement } from "@/components/alert-management";
export const metadata: Metadata = {
  title: "Milestone email preferences — Take The Wall",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return (
    <main className="owner-page">
      <header className="owner-page-header">
        <Link href="/">TAKE THE WALL</Link>
      </header>
      <AlertManagement />
      <footer className="owner-page-footer">
        <Link href="/">Back to the live wall</Link>
      </footer>
    </main>
  );
}
