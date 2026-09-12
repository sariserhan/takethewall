import Link from "next/link";
import type { Metadata } from "next";
import { SystemScreen } from "@/components/system-screen";
export const metadata: Metadata = {
  title: "Wall not found | Take The Wall",
  robots: { index: false, follow: true },
};
export default function NotFound() {
  return (
    <SystemScreen
      code="404"
      title="WRONG TURN.
RIGHT WALL."
    >
      <p>
        This page doesn’t exist, but your next moment on the wall might. Check
        the address or head back to the live wall.
      </p>
      <div className="system-actions">
        <Link className="button" href="/">
          BACK TO THE WALL <span aria-hidden="true">→</span>
        </Link>
        <Link href="/?info=how-it-works">How it works</Link>
      </div>
    </SystemScreen>
  );
}
