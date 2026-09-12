import Link from "next/link";
import type { Metadata } from "next";
import { SystemScreen } from "@/components/system-screen";
export const metadata: Metadata = {
  title: "Wall not found | Take The Wall",
  robots: { index: false, follow: true },
};
export default function NotFound() {
  return (
    <SystemScreen code="404" title="THIS WALL DOESN’T EXIST.">
      <p>
        The link may be incorrect or the page may have moved. The live wall is
        still one click away.
      </p>
      <Link className="button" href="/">
        BACK TO THE WALL
      </Link>
    </SystemScreen>
  );
}
