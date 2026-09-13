import { Suspense } from "react";
import { HomeReferral } from "@/components/home-referral";
import type { Metadata } from "next";
import Wall from "@/components/wall";
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: "Take The Wall — One page. One owner. Who’s next?",
    description:
      "One page. One owner. A project, a message, or something unexpected. See who owns the wall.",
    type: "website",
  },
};
export default function Page() {
  return (
    <>
      <Suspense fallback={null}>
        <HomeReferral />
      </Suspense>
      <Wall />
    </>
  );
}
