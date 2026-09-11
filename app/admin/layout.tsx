import Link from "next/link";
import { AdminProvider } from "@/components/admin-provider";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "TakeTheWall Admin",
  robots: { index: false, follow: false, noarchive: true },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL)
    return (
      <main className="document-page">
        <Link href="/">TAKE THE WALL</Link>
        <h1>ADMIN</h1>
        <p>Administrator sign-in is not configured. Access is unavailable.</p>
      </main>
    );
  return (
    <main className="admin-shell">
      <AdminProvider>{children}</AdminProvider>
    </main>
  );
}
