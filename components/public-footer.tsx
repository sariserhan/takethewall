import Link from "next/link";
import { HistoryLink } from "./history-link";
import Script from "next/script";
import { MILESTONES } from "@/lib/config";
import { InfoOverlay } from "./info-overlay";
export const infoLinks = [
  ["How it works", "how-it-works"],
  ["How prizes work", "how-prizes-work"],
  ["About", "about"],
  ["Support", "support"],
  ["Contact", "contact"],
  ["Reward Rules & Free Entry", "rewards"],
  ["About the numbers", "numbers"],
  ["Terms", "terms"],
  ["Privacy", "privacy"],
  ["Content policy", "content-policy"],
  ["Disclaimer", "disclaimer"],
  ["Disclosure", "disclosure"],
];
export function PublicFooter({ home = false }: { home?: boolean }) {
  return (
    <>
      <footer className="public-footer">
        <nav aria-label="Information">
          <Link href="/owner">Owner dashboard</Link>
          <HistoryLink />
          {infoLinks.map(([label, key]) => (
            <Link key={key} href={`/?info=${key}`}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="footer-winner-groups">
          <nav className="milestone-footer" aria-label="Milestone walls">
            <span>MILESTONE WINNERS · REWARD A</span>
            {MILESTONES.map((m) => (
              <Link key={m.takeoverNumber} href={`/${m.takeoverNumber}`}>
                #{m.takeoverNumber.toLocaleString("en-US")}
              </Link>
            ))}
          </nav>
          <nav className="milestone-footer" aria-label="Referral winner walls">
            <span>REFERRAL WINNERS · REWARD B</span>
            {MILESTONES.map((m) => (
              <Link
                key={m.takeoverNumber}
                href={`/${m.takeoverNumber}/referral`}
              >
                #{m.takeoverNumber.toLocaleString("en-US")}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
      {home && <InfoOverlay />}
      <Script
        src="https://cdn.visitorping.com/site/vp_KMTZX9SH.js"
        strategy="afterInteractive"
        crossOrigin="anonymous"
      />
    </>
  );
}
