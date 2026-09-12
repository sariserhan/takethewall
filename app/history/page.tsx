import Link from "next/link";
import { notFound } from "next/navigation";
import { Arrow } from "@/components/arrow";
import Image from "next/image";
import type { Metadata } from "next";
import { backend } from "@/lib/server";
import { siteUrl } from "@/lib/site-url";
import { duration } from "@/lib/validation";
import type { HistoryPage } from "@/lib/history-types";
import { PublicFooter } from "@/components/public-footer";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}): Promise<Metadata> {
  const { before } = await searchParams;
  return {
    title: "Wall history — the people and projects who took over",
    description:
      "Explore previous wall owners, their projects, and recorded reigns.",
    alternates: {
      canonical: new URL(
        before ? `/history?before=${encodeURIComponent(before)}` : "/history",
        siteUrl(),
      ).href,
    },
  };
}
export default async function History({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const { before } = await searchParams;
  const cursor = before && /^\d+$/.test(before) ? Number(before) : undefined;
  const data = await backend<HistoryPage | null>("growthHistory", {
    ...(cursor && Number.isSafeInteger(cursor) ? { before: cursor } : {}),
  });
  if (!data) notFound();
  return (
    <main className="owner-page history-page">
      <header className="owner-page-header">
        <Link href="/">TAKE THE WALL</Link>
        <Link href="/">
          See the live wall <Arrow />
        </Link>
      </header>
      <section>
        <p className="eyebrow">THE PEOPLE. THE PROJECTS. THE REIGNS.</p>
        <h1>WALL HISTORY.</h1>
        <p>
          One owner at a time. Every published takeover has its own place in
          history.
        </p>
      </section>
      <div className="history-grid">
        {data.entries.map((t) => (
          <article key={t.publicId}>
            {t.image ? (
              <Image
                src={t.image}
                alt=""
                width={100}
                height={100}
                unoptimized
              />
            ) : (
              <span className="history-mark" aria-hidden>
                W.
              </span>
            )}
            <p className="eyebrow">{t.live ? "LIVE NOW" : "PAST OWNER"}</p>
            <h2>
              <Link href={`/takeover/${t.publicId}`}>{t.name}</Link>
            </h2>
            <p>{t.description}</p>
            <p className="field-note">
              Since {new Date(t.activatedAt).toISOString().slice(0, 10)} ·{" "}
              {t.replacedAt !== null
                ? `Recorded reign: ${duration(Math.max(0, t.replacedAt - t.activatedAt))}`
                : "Reign in progress"}
            </p>
            <Link href={`/takeover/${t.publicId}`}>
              View takeover <Arrow />
            </Link>
          </article>
        ))}
      </div>
      {!data.entries.length && (
        <p>No public takeovers in this part of the archive yet.</p>
      )}
      <nav className="owner-share-actions" aria-label="History pages">
        {before && <Link href="/history">Latest takeovers</Link>}
        {data.next !== null && (
          <Link href={`/history?before=${data.next}`}>
            Older takeovers <Arrow />
          </Link>
        )}
      </nav>
      <PublicFooter />
    </main>
  );
}
