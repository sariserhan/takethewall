"use client";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { BackendProvider } from "./backend-provider";
import { LoadingSkeleton } from "./loading-skeleton";
import { rewardStatus } from "@/lib/reward-status";
type Overview = FunctionReturnType<typeof api.rewards.overview>;
export function ReferralMilestonePage({ number }: { number: number }) {
  return (
    <BackendProvider>
      <ReferralView number={number} />
    </BackendProvider>
  );
}
function ReferralView({ number }: { number: number }) {
  const data = useQuery(api.rewards.overview, { number });
  return data ? (
    <ReferralContent data={data} number={number} />
  ) : (
    <LoadingSkeleton label="Loading referral reward" />
  );
}
export function ReferralContent({
  data,
  number,
}: {
  data: Overview;
  number: number;
}) {
  const m = data.milestones.find((m) => m.number === number),
    reward = m?.performance;
  const format = (n: number) => n.toLocaleString("en-US");
  if (!m) return <p>This milestone is unavailable.</p>;
  if (!reward)
    return (
      <>
        <h1>REFERRAL WALL · #{format(number)}</h1>
        <p>
          A referral reward is not available for this milestone under its rules.
        </p>
        <Link href={`/${number}`}>View milestone wall →</Link>
      </>
    );
  const winner = reward.status === "paid" ? reward.snapshot : null;
  return (
    <>
      <div className="permanent-heading">
        <p className="eyebrow">REWARD B · PERMANENT WALL / #{format(number)}</p>
        <h1>
          {data.promotionEnabled
            ? `$${format(reward.rewardUsd)} REFERRAL WALL`
            : `REFERRAL WALL · #${format(number)}`}
        </h1>
        <p className="permanent-lede">
          Bring people to the wall. Earn a lasting place in its history.
        </p>
        <p className="permanent-status">
          {rewardStatus(
            reward.status,
            data.currentNumber >= reward.cohortFrom || reward.cohortFrom === 1,
          )}
        </p>
      </div>
      {winner ? (
        <>
          <div className="trophy-ad">
            {reward.logoUrl && (
              <Image
                src={reward.logoUrl}
                width={280}
                height={280}
                unoptimized
                alt={winner.displayName}
              />
            )}
            <p className="eyebrow">
              CONFIRMED PAID WINNER · TAKEOVER #{format(reward.candidateNumber)}
            </p>
            <h2>{winner.displayName}</h2>
            <p>{winner.description}</p>
            {reward.outboundLinkEnabled &&
              winner.contentType !== "personal" && (
                <a
                  className="button"
                  href={winner.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                >
                  Visit winner →
                </a>
              )}
          </div>
          <dl className="trophy-stats">
            <div>
              <dt>REWARD</dt>
              <dd>${format(reward.rewardUsd)}</dd>
            </div>
            <div>
              <dt>VERIFIED REFERRALS AT CUTOFF</dt>
              <dd>{format(reward.verifiedReferrals)}</dd>
            </div>
            <div>
              <dt>ORIGINAL IMPRESSIONS</dt>
              <dd>{format(winner.impressions)}</dd>
            </div>
            <div>
              <dt>ORIGINAL UNIQUE VISITORS</dt>
              <dd>{format(winner.uniqueVisitors)}</dd>
            </div>
            <div>
              <dt>ORIGINAL CLICKS</dt>
              <dd>{format(winner.clicks)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <div className="permanent-future">
          <section className="permanent-placeholder">
            <span className="eyebrow">
              {reward.status === "unawarded"
                ? "NO WINNER"
                : "NO CONFIRMED WINNER YET"}
            </span>
            <h2>
              {reward.status === "future"
                ? "BRING THE CROWD.\nMAKE WALL HISTORY."
                : rewardStatus(reward.status)}
            </h2>
            {reward.candidateNumber > 0 &&
              !["future", "selecting", "unawarded"].includes(reward.status) && (
                <p>
                  Provisional recipient: takeover #
                  {format(reward.candidateNumber)} ·{" "}
                  {format(reward.verifiedReferrals)} verified referrals at
                  cutoff. Subject to verification and payout.
                </p>
              )}
            <p>
              {reward.status === "future"
                ? `Referral ranking is calculated when takeover #${format(number)} closes this cohort. There is no confirmed winner before that.`
                : reward.status === "unawarded"
                  ? "No eligible ranked entrant qualified. This reward remains unawarded."
                  : "This page will display the winner’s image, name, message and original statistics after payout is confirmed."}
            </p>
            <span className="permanent-address">
              takethewall.com/{number}/referral
            </span>
          </section>
          <section className="permanent-details">
            <div className="permanent-progress">
              <span className="eyebrow">
                COHORT CLOSES AT #{format(number)}
              </span>
              <div className="permanent-count">
                <strong>{format(data.currentNumber)}</strong>
                <span>/ {format(number)}</span>
              </div>
              <progress
                aria-label="Progress to referral cutoff"
                value={Math.min(data.currentNumber, number)}
                max={number}
              />
            </div>
            <div className="permanent-benefits">
              <h2>HOW REWARD B WORKS</h2>
              <p>
                Eligible takeovers #{format(reward.cohortFrom)}–#
                {format(reward.cohortTo)} compete by verified referral visitors
                recorded before the cutoff.
              </p>
              <p>
                Share your personal referral link from the owner dashboard. At
                least one verified referral is required. Ties use unique
                visitors, then the earlier takeover number.
              </p>
              <p>
                If the leading entrant fails verification, the next eligible
                ranked entrant is considered. If none qualifies, the reward is
                unawarded.
              </p>
            </div>
            <Link className="button" href="/owner">
              Open owner dashboard →
            </Link>
          </section>
        </div>
      )}
      <nav className="reward-page-links" aria-label="Reward pages">
        <Link href={`/${number}`}>Reward A · Milestone winner →</Link>
        <Link href="/?info=how-prizes-work">How both prizes work →</Link>
      </nav>
      <p className="permanent-rules">
        <Link href={`/rewards?version=${encodeURIComponent(m.rulesVersion)}`}>
          Reward Rules & free entry instructions
        </Link>{" "}
        · Subject to eligibility. No purchase necessary. A prize is not
        guaranteed.
      </p>
    </>
  );
}
