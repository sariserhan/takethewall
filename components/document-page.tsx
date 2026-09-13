import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { publicCopy, legalVersion } from "@/lib/public-copy";
import { PublicFooter } from "@/components/public-footer";
export function documentMetadata(info: string): Metadata {
  const page = publicCopy[info];
  return page
    ? {
        title: `${page.title} | TakeTheWall`,
        description: page.intro,
        alternates: { canonical: `/${info}` },
      }
    : {};
}
export function DocumentPage({ info }: { info: string }) {
  const page = publicCopy[info];
  if (!page) notFound();
  return (
    <main className="document-page">
      <Link href="/">TAKE THE WALL</Link>
      <h1>{page.title}</h1>
      <p className="lede">{page.intro}</p>
      {["terms", "privacy", "disclaimer", "disclosure"].includes(info) && (
        <p className="eyebrow">VERSION {legalVersion}</p>
      )}
      {page.sections.map((section) =>
        info === "support" ? (
          <details key={section.title}>
            <summary>{section.title}</summary>
            <p>{section.body}</p>
          </details>
        ) : (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ),
      )}
      <p>
        <Link href="/rewards">Read Reward Rules</Link> ·{" "}
        <Link href="/contact">Contact TakeTheWall</Link>
      </p>
      <Link className="button" href="/?take=1">
        TAKE THE WALL — $4.99
      </Link>
      <PublicFooter />
    </main>
  );
}
