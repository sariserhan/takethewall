"use client";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
export function ReferralLeaderboard({
  number,
  compact = false,
}: {
  number: number;
  compact?: boolean;
}) {
  const data = useQuery(api.referralLeaderboard.board, { number });
  const format = (n: number) => n.toLocaleString("en-US");
  const leader = data?.entries[0];
  const empty =
    !data || data.state === "updating"
      ? "Updating referral standings…"
      : data.state === "selecting"
        ? "Cohort closed · Verifying final ranking"
        : data.state === "unavailable"
          ? "Referral standings unavailable"
          : data.state === "closed"
            ? "Cohort closed · No eligible ranked entrants"
            : "No verified referrals yet — no leader.";
  if (compact)
    return (
      <span className="referral-leader-summary">
        {leader ? (
          <>
            <b>
              {data.state === "closed"
                ? "Top ranked at cutoff"
                : "Currently leading"}
            </b>
            <span>
              {leader.name} · #{format(leader.number)}
            </span>
            <span>
              {format(leader.referrals)} verified referral
              {leader.referrals === 1 ? "" : "s"}
            </span>
            <small>Provisional · Subject to verification</small>
          </>
        ) : data?.state === "live" ? (
          <><b>The lead is open.</b><span>No verified referrals yet — no leader.</span><small>Share your owner-dashboard referral link to get started.</small></>
        ) : (
          empty
        )}
      </span>
    );
  return (
    <section className="referral-leaderboard" aria-label="Referral leaderboard">
      <span className="eyebrow">
        {data?.state === "closed"
          ? "RANKING AT CUTOFF"
          : "LIVE REFERRAL STANDINGS"}
      </span>
      <h2>{data?.state === "closed" ? "COHORT CLOSED" : "WHO’S LEADING?"}</h2>
      {leader ? (
        <>
          <p>
            {data.state === "closed"
              ? "Highest ranked at the cutoff"
              : "Currently leading"}
            :{" "}
            <strong>
              {leader.name} · #{format(leader.number)}
            </strong>{" "}
            with {format(leader.referrals)} verified referrals.
          </p>
          <ol className="referral-rank-list">
            {data.entries.map((row, i) => (
              <li key={row.publicId}>
                <span className="referral-position">{i + 1}</span>
                <div>
                  <Link href={`/takeover/${encodeURIComponent(row.publicId)}`}>
                    {row.name}
                  </Link>
                  <small>
                    Takeover #{format(row.number)} ·{" "}
                    {format(row.uniqueVisitors)} unique visitors
                  </small>
                </div>
                <strong>
                  {format(row.referrals)}
                  <small>verified referrals</small>
                </strong>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="referral-empty"><p>{empty}</p>{data?.state === "live" && <p>Share the referral link in your owner dashboard. Eligible verified visits build your score here.</p>}</div>
      )}
      <p>
        {data?.state === "closed"
          ? "These scores are frozen at the cohort cutoff. The confirmed paid winner is shown separately above."
          : `Standings update as verified referrals are recorded, until takeover #${format(number)} closes the cohort.`}{" "}
        A lead is provisional and does not guarantee a prize. Ties use unique
        visitors, then the earlier takeover number.
      </p>
      <p>
        <Link href="/owner">
          Get your referral link in the owner dashboard →
        </Link>
      </p>
    </section>
  );
}
