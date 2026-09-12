import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { cache } from "react";
import { api } from "@/convex/_generated/api";
import { MILESTONES } from "@/lib/config";
export const dynamic = "force-dynamic";
import { MilestonePage } from "@/components/milestones";
import { PublicFooter } from "@/components/public-footer";
const numberOf = cache(async (value: string) => {
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const known = MILESTONES.find((m) => String(m.takeoverNumber) === value);
  try {
    const data = await fetchQuery(api.rewards.overview, {});
    const m = data.milestones.find((m) => String(m.number) === value);
    return m
      ? {
          takeoverNumber: m.number,
          title: data.promotionEnabled
            ? `The $${m.rewardUsd.toLocaleString("en-US")} Wall`
            : `Milestone #${m.number.toLocaleString("en-US")}`,
        }
      : null;
  } catch {
    if (known)
      return {
        ...known,
        title: `Milestone #${known.takeoverNumber.toLocaleString("en-US")}`,
      };
    throw new Error("Milestone service temporarily unavailable");
  }
});
export async function generateMetadata({
  params,
}: {
  params: Promise<{ milestone: string }>;
}) {
  const { milestone } = await params;
  const m = await numberOf(milestone);
  return m
    ? {
        title: `${m.title} | TakeTheWall`,
        description: `Follow the progress, verification, and permanent trophy for TakeTheWall milestone #${m.takeoverNumber}.`,
        alternates: { canonical: `/${m.takeoverNumber}` },
        openGraph: {
          title: `${m.title} | TakeTheWall`,
          description: `Follow the progress, verification, and permanent trophy for TakeTheWall milestone #${m.takeoverNumber}.`,
          url: `/${m.takeoverNumber}`,
          type: "website" as const,
        },
      }
    : {};
}
export default async function Page({
  params,
}: {
  params: Promise<{ milestone: string }>;
}) {
  const { milestone } = await params;
  const m = await numberOf(milestone);
  if (!m) notFound();
  return (
    <main className="document-page milestone-page">
      <Link href="/">TAKE THE WALL</Link>
      <section className="milestone-content">
        <MilestonePage number={m.takeoverNumber} />
      </section>
      <PublicFooter />
    </main>
  );
}
