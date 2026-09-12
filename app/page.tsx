import type { Metadata } from "next";
import Wall from "@/components/wall";
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: "Take The Wall — One Wall. One Owner. $3.99.",
    description: "Pay $3.99. Take the wall. Keep it until someone else does.",
    type: "website",
  },
};
export default function Page() {
  return <Wall />;
}
