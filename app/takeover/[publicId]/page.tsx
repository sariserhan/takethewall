import { WallCanvas } from "@/components/wall-canvas";
import { OwnershipBadge } from "@/components/ownership-badge";
import { HistoryLink } from "@/components/history-link";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
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
  if (via === "share")
    redirect(`/?ref=${encodeURIComponent(publicId)}&via=share`);
  const name = owner.displayName || owner.domain;
  const utc = (value: number) =>
    new Date(value).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const number = owner.takeoverNumber
    ? `#${owner.takeoverNumber.toLocaleString("en-US")}`
    : "";
  return (
    <main className="owner-page public-takeover">
      <header className="owner-page-header">
        <Link href="/">TAKE THE WALL</Link>
        <Link href="/" className="takeover-back">
          Back to the live wall ↗
        </Link>
      </header>
      <section className="takeover-record-heading">
        <div>
          <p className="eyebrow">TAKEOVER {number}</p>
          <h1>{name}</h1>
        </div>
        <span
          className={`takeover-record-status ${data.active ? "live" : "ended"}`}
        >
          {data.active ? "● CURRENT OWNER" : "PAST OWNER"}
        </span>
      </section>
      <section
        className={`shared-takeover-stage ${owner.canvasDesign ? "designed-record" : "simple-record"}`}
        aria-label="Takeover content"
      >
        {owner.canvasDesign ? (
          <WallCanvas
            linksEnabled={owner.canvasLinksEnabled ?? owner.outboundLinkEnabled}
            design={owner.canvasDesign}
            images={owner.canvasImages}
            href={owner.outboundLinkEnabled ? owner.websiteUrl : undefined}
          />
        ) : (
          <>
            {owner.logoUrl && (
              <Image
                src={owner.logoUrl}
                width={200}
                height={200}
                alt={name}
                unoptimized
              />
            )}
            <h2>{name}</h2>
            {owner.description && <p>{owner.description}</p>}
            {owner.outboundLinkEnabled && owner.websiteUrl && (
              <a
                className="button"
                href={owner.websiteUrl}
                target="_blank"
                rel="noopener noreferrer nofollow sponsored"
              >
                Visit {owner.domain || "their website"} ↗
              </a>
            )}
          </>
        )}
      </section>
      <section
        className="takeover-record-stats"
        aria-label="Takeover statistics"
      >
        {[
          ["Impressions", owner.impressions],
          ["Unique visitors", owner.uniqueVisitors],
          ["Clicks", owner.clicks],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{Number(value).toLocaleString("en-US")}</strong>
          </div>
        ))}
        <div className="takeover-record-time">
          <span>Owner since</span>
          <time dateTime={new Date(owner.activatedAt).toISOString()}>
            {utc(owner.activatedAt)}
          </time>
          {data.replacedAt && <small>Ended {utc(data.replacedAt)}</small>}
        </div>
      </section>
      {data.editorial && (
        <section className="editorial-overview">
          <h2>About this takeover</h2>
          <p>{data.editorial}</p>
        </section>
      )}
      <section
        className="takeover-record-sharing"
        aria-labelledby="record-sharing-title"
      >
        <div className="takeover-sharing-intro">
          <p className="eyebrow">KEEP YOUR MOMENT</p>
          <h2 id="record-sharing-title">Share the takeover.</h2>
          <p>
            Download a card, save your certificate, or share a referral link to
            the live wall.
          </p>
        </div>
        <div className="takeover-record-downloads">
          <div className="owner-share-actions">
            <a
              href={`/takeover/${publicId}/card?download=1&format=landscape`}
              download
            >
              Landscape card ↗
            </a>
            <a
              href={`/takeover/${publicId}/card?download=1&format=square`}
              download
            >
              Square card ↗
            </a>
            <a
              href={`/takeover/${publicId}/card?download=1&format=portrait`}
              download
            >
              Portrait card ↗
            </a>
            <Link href={`/takeover/${publicId}/certificate`}>
              Print certificate ↗
            </Link>
          </div>
          <OwnershipBadge publicId={publicId} />
        </div>
      </section>
      <footer className="owner-page-footer">
        <div>
          <HistoryLink>Browse wall history</HistoryLink>
          <Link href="/?info=how-it-works">How it works</Link>
          <Link href="/?info=content-policy">Content policy</Link>
        </div>
        <small>Public ID · {publicId}</small>
      </footer>
    </main>
  );
}
