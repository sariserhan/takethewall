import { BrandLink } from "@/components/brand-link";
import { notFound } from "next/navigation";
import Link from "next/link";
import { milestoneOf } from "@/lib/milestone-page";
export const dynamic = "force-dynamic";
import { MilestonePage } from "@/components/milestones";
import { PublicFooter } from "@/components/public-footer";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ milestone: string }>;
}) {
  const { milestone } = await params;
  const m = await milestoneOf(milestone);
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
  const m = await milestoneOf(milestone);
  if (!m) notFound();
  return (
    <main className="document-page milestone-page">
      <header className="permanent-header">
        <BrandLink className="permanent-wordmark" />
        <Link href="/" className="permanent-back">
          ← Back to the live wall
        </Link>
      </header>
      <section className="milestone-content">
        <MilestonePage number={m.takeoverNumber} />
      </section>
      <PublicFooter />
    </main>
  );
}
