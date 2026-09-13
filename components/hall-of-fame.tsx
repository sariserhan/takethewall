"use client";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { duration } from "@/lib/validation";
const labels = {
  reign: "Longest completed reign",
  referrals: "Referral champion",
  clicks: "Most outbound clicks",
};
export function HallOfFame() {
  const data = useQuery(api.hall.leaders, {});
  if (!data) return null;
  return (
    <section
      className="hall-of-fame"
      id="hall-of-fame"
      aria-labelledby="hall-title"
    >
      <p className="eyebrow">WALL RECORDS</p>
      <h2 id="hall-title">HALL OF FAME</h2>
      <p>Recorded results. Real placements. A place to make your mark.</p>
      {!data.ready ? (
        <p>Preparing the records…</p>
      ) : !data.entries.length ? (
        <p>The first records are still waiting to be set.</p>
      ) : (
        <div className="hall-grid">
          {data.entries.map((entry) => (
            <article key={entry.category}>
              <p className="eyebrow">{labels[entry.category]}</p>
              <strong>
                {entry.category === "reign"
                  ? duration(entry.value)
                  : entry.value.toLocaleString("en-US")}
              </strong>
              <h3>
                <Link href={`/takeover/${entry.publicId}`}>{entry.name} ↗</Link>
              </h3>
              <Link href={`/takeover/${entry.publicId}`}>
                View placement & share →
              </Link>
            </article>
          ))}
        </div>
      )}
      <p className="field-note">
        Live rankings can change. Longest reign counts completed placements
        only. Test placements and demo additions are excluded. These records do
        not award extra prizes.
      </p>
    </section>
  );
}
