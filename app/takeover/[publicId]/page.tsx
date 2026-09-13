import { WallCanvas } from "@/components/wall-canvas";
import { OwnershipBadge } from "@/components/ownership-badge";
import { HistoryLink } from "@/components/history-link";
import { ReferralVisit } from "@/components/referral-visit";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSharedTakeover } from "@/lib/shared-takeover";
import { siteUrl } from "@/lib/site-url";
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ via?: string }>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicId } = await params;
  const data = await getSharedTakeover(publicId);
  if (!data) return { title: "Takeover unavailable" };
  const title = `${data.owner.displayName} took the wall${data.owner.takeoverNumber ? ` — #${data.owner.takeoverNumber}` : ""}`;
  return {
    title,
    description:
      data.owner.description || "One wall. One owner. See this takeover.",
    robots: { index: data.searchIndexable === true, follow: true },
    alternates: { canonical: new URL(`/takeover/${publicId}`, siteUrl()).href },
    openGraph: {
      title,
      images: [
        {
          url: new URL(`/takeover/${publicId}/card`, siteUrl()).href,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      images: [new URL(`/takeover/${publicId}/card`, siteUrl()).href],
    },
  };
}
export default async function SharedPage({ params, searchParams }: Props) {
  const { publicId } = await params;
  const data = await getSharedTakeover(publicId);
  if (!data) notFound();
  const owner = data.owner;
  const via = (await searchParams).via;
  return (
    <main className="owner-page public-takeover">
      {via === "share" && <ReferralVisit publicId={publicId} />}
      <header className="owner-page-header">
        <Link href="/">TAKE THE WALL</Link>
        <span>{data.active ? "LIVE NOW" : "WALL HISTORY"}</span>
      </header>
      <section className="shared-takeover-stage">
        <p className="eyebrow">
          TAKEOVER {owner.takeoverNumber ? `#${owner.takeoverNumber}` : ""}
        </p>
        <h1>{data.active ? "ON THE WALL." : "I TOOK THE WALL."}</h1>
        {owner.canvasDesign && <WallCanvas design={owner.canvasDesign} images={owner.canvasImages} href={owner.outboundLinkEnabled ? owner.websiteUrl : undefined} />}
        {!owner.canvasDesign && owner.logoUrl && (
          <Image
            src={owner.logoUrl}
            width={160}
            height={160}
            alt={owner.displayName}
            unoptimized
          />
        )}
        <h2>{owner.displayName || owner.domain}</h2>
        <p>{owner.description}</p>
        {data.editorial && (
          <section className="editorial-overview">
            <h2>About this takeover</h2>
            <p>{data.editorial}</p>
          </section>
        )}
        <p className="field-note">
          Activated{" "}
          {new Date(owner.activatedAt)
            .toISOString()
            .replace("T", " ")
            .slice(0, 19)}{" "}
          UTC
          {data.replacedAt
            ? ` · Reign ended ${new Date(data.replacedAt).toISOString().replace("T", " ").slice(0, 19)} UTC`
            : ""}
        </p>
        {owner.outboundLinkEnabled && owner.websiteUrl && (
          <a
            href={owner.websiteUrl}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
          >
            Visit their link ↗
          </a>
        )}
        <div className="owner-share-actions">
          <a
            href={`/takeover/${publicId}/card?download=1&format=landscape`}
            download
          >
            Download share card
          </a>
          <a
            href={`/takeover/${publicId}/card?download=1&format=square`}
            download
          >
            Square card
          </a>
          <a
            href={`/takeover/${publicId}/card?download=1&format=portrait`}
            download
          >
            Portrait card
          </a>
        </div>
        <Link href={`/takeover/${publicId}/certificate`}>Print placement certificate</Link>
        <OwnershipBadge publicId={publicId} />
        <Link className="button" href="/">
          See the live wall ↗
        </Link>
      </section>
      <footer className="owner-page-footer">
        <HistoryLink>Browse wall history</HistoryLink>
        <Link href="/?info=how-it-works">How it works</Link>
        <Link href="/?info=content-policy">Content policy</Link>
      </footer>
    </main>
  );
}
