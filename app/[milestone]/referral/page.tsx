import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandLink } from "@/components/brand-link";
import { PublicFooter } from "@/components/public-footer";
import { ReferralMilestonePage } from "@/components/referral-milestone";
import { milestoneOf } from "@/lib/milestone-page";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ milestone: string }> };
export async function generateMetadata({ params }: Props) {
  const m = await milestoneOf((await params).milestone);
  if (!m) return {};
  const title = `Referral winner · Milestone #${m.takeoverNumber.toLocaleString("en-US")} | TakeTheWall`;
  const description =
    "Follow the referral reward, recipient verification and permanent paid winner’s wall.";
  const url = `/${m.takeoverNumber}/referral`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" as const },
  };
}
export default async function Page({ params }: Props) {
  const m = await milestoneOf((await params).milestone);
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
        <ReferralMilestonePage number={m.takeoverNumber} />
      </section>
      <PublicFooter />
    </main>
  );
}
