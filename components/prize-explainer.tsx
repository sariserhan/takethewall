import Link from "next/link";
import { ReferralLeaderboard } from "./referral-leaderboard";
import { rewardStatus } from "@/lib/reward-status";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
type Overview = FunctionReturnType<typeof api.rewards.overview>;
const rewardLabels: Record<string, string> = {
  selecting: "Evaluating traffic",
  unawarded: "Unawarded",
  pending_claim: "Awaiting claim",
  under_review: "Under review",
  approved: "Approved - Awaiting payout",
  paid: "Completed - Paid",
  awaiting_successor: "Awaiting next claimant",
};
export function PrizeExplainer({
  data,
  demo = false,
}: {
  data: Overview;
  demo?: boolean;
}) {
  if (!data.promotionEnabled) return null;
  const ordered = [...data.milestones].sort((a, b) => a.number - b.number);
  const next = ordered.find((m) => m.number > data.currentNumber);
  const format = (n: number) => n.toLocaleString("en-US");
  return (
    <section className="prize-explainer" aria-labelledby="prize-title">
      {demo && (
        <p className="demo-progress-notice">
          <strong>DEMO PROGRESS</strong> — Displayed progress combines real
          takeovers and demo additions. No number is reserved and no prize is
          earned. Milestone links below show real records.
        </p>
      )}
      <div className="prize-intro">
        <span className="eyebrow">YOUR PURCHASE & THE PRIZES</span>
        <h2 id="prize-title">$4.99 BUYS YOUR TIME ON THE WALL.</h2>
        <p>Your content stays until the next takeover replaces it.</p>
        <p className="prize-claim-summary">
          {next ? (
            <>
              Takeover <strong>#{format(next.number)}</strong> starts the claim
              for the <strong>${format(next.rewardUsd)} prize</strong>.
            </>
          ) : (
            <>
              All prize milestones have been reached. Follow their winner pages
              below.
            </>
          )}
        </p>
        <p className="free-entry-callout">
          No purchase necessary.{" "}
          <Link href="/?info=free-entry">Enter free by email →</Link>
        </p>
        <Link href="/?info=how-prizes-work">How prizes work →</Link>
      </div>
      {next ? (
        <div className="prize-next">
          <span>
            {demo ? "DEMO · " : ""}NEXT PRIZE MILESTONE · #{format(next.number)}
          </span>
          <strong>
            {next.performance ? "2 × " : ""}${format(next.rewardUsd)}{" "}
            {next.performance ? "REWARDS" : "REWARD"}
          </strong>
          {next.performance && (
            <p>
              One for the milestone placement. One for the preceding cohort’s
              verified referral leader.
            </p>
          )}
          <progress
            aria-label={`Progress toward milestone ${next.number}`}
            value={data.currentNumber}
            max={next.number}
          />
          <p className="prize-count">
            <b>
              {data.currentNumber === 0
                ? "No numbered takeovers yet"
                : `${demo ? "Demo takeover number" : "Latest takeover number"}: #${format(data.currentNumber)}`}
            </b>
            <br />
            {format(next.number - data.currentNumber)} to go until #
            {format(next.number)}
          </p>
          <small>
            A milestone starts a claim, not a guaranteed payout. Eligibility and
            verification apply. See the{" "}
            <Link href="/?info=rewards">Reward Rules</Link>.
          </small>
        </div>
      ) : (
        <div className="prize-next">
          <strong>ALL MILESTONES REACHED</strong>
          <p>
            Follow verification and confirmed winners on the milestone pages
            below.
          </p>
        </div>
      )}
      {next && (
        <div className="reward-paths" aria-label="Ways to earn a reward">
          <article>
            <span className="eyebrow">REWARD A · MILESTONE PLACEMENT</span>
            <h3>REACH #{format(next.number)}</h3>
            <strong>${format(next.rewardUsd)} reward</strong>
            <p>
              The qualifying placement at this milestone starts the claim.
              Activation assigns your number; checkout does not reserve it.
            </p>
            <Link href={`/${next.number}`}>
              Milestone prize & permanent winner page →
            </Link>
          </article>
          {next.performance && (
            <article>
              <span className="eyebrow">REWARD B · REFERRAL LEADER</span>
              <h3>BRING THE MOST VISITORS</h3>
              <strong>${format(next.performance.rewardUsd)} reward</strong>
              <p>
                Takeovers #{format(next.performance.cohortFrom)}–#
                {format(next.performance.cohortTo)}: share your owner-dashboard
                referral link. The entrant with the most verified referrals at
                the cutoff starts a separate claim.
              </p>
              <p>
                At least one verified referral is required. Standings stay
                provisional until #{format(next.number)} goes live.
              </p>
              <ReferralLeaderboard number={next.number} compact />
              <Link href={`/${next.number}/referral`}>
                Referral prize & permanent winner page →
              </Link>
            </article>
          )}
        </div>
      )}
      {ordered.some(
        (m) =>
          m.status !== "future" ||
          (m.performance && m.performance.status !== "future"),
      ) && (
        <section
          className="reward-results"
          aria-label="Reward recipients and winners"
        >
          <h3>RECIPIENTS & CONFIRMED WINNERS</h3>
          <div className="reward-paths">
            {ordered
              .flatMap((m) => [
                { ...m, label: "Reward A", href: `/${m.number}` },
                ...(m.performance
                  ? [
                      {
                        ...m.performance,
                        number: m.number,
                        label: "Reward B",
                        href: `/${m.number}/referral`,
                      },
                    ]
                  : []),
              ])
              .filter((r) => r.status !== "future")
              .map((r) => (
                <article key={r.href}>
                  <span className="eyebrow">
                    {r.label} · #{format(r.number)}
                  </span>
                  <h3>{rewardStatus(r.status)}</h3>
                  <p>
                    {r.status === "paid" && r.snapshot
                      ? r.snapshot.displayName
                      : r.candidateNumber > 0 &&
                          !["selecting", "unawarded"].includes(r.status)
                        ? `Provisional recipient: takeover #${format(r.candidateNumber)}`
                        : "No confirmed winner yet."}
                  </p>
                  <Link href={r.href}>View permanent reward page →</Link>
                </article>
              ))}
          </div>
        </section>
      )}
      <details className="prize-details">
        <summary>How claiming a reward works</summary>
        <ol className="prize-steps">
          <li>
            <span>01</span>
            <div>
              <h3>Publish for $4.99</h3>
              <p>Get your number when your takeover goes live.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Qualify through either path</h3>
              <p>
                Reach a milestone or lead its eligible referral cohort. We email
                the selected recipient a protected claim link.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Complete verification</h3>
              <p>If approved and paid, you get a permanent winner page.</p>
            </div>
          </li>
        </ol>
        <div className="prize-difference">
          <span>
            <b>LIVE WALL</b> · Temporary placement
          </span>
          <span>
            <b>WINNER PAGE</b> · Permanent after confirmed payout
          </span>
        </div>
      </details>
      {!!data.numberingOffset && (
        <p className="numbering-note">
          Numbering starts with an offset of {data.numberingOffset}, not
          completed takeovers. Prizes follow the public numbers.
        </p>
      )}
      <p className="prize-admin-note">
        <strong>What counts?</strong> Paid takeovers and labeled, counted admin
        placements advance the number and can qualify. Counted admin placements
        skip payment; uncounted placements do neither.{" "}
        <Link href="/?info=how-prizes-work">Details &amp; rules →</Link>
      </p>
      <nav className="prize-milestones" aria-label="Prize milestones">
        {ordered.map((m) => (
          <div className="reward-milestone-pair" key={m.number}>
            <Link href={`/${m.number}`}>
              <span>#{format(m.number)}</span>
              <span className="reward-card-label">Milestone reward</span>
              <strong>${format(m.rewardUsd)}</strong>
              <small>
                {m.status === "future"
                  ? m.number === next?.number
                    ? "In progress"
                    : "Upcoming"
                  : (rewardLabels[m.status] ?? "Under review")}
              </small>
            </Link>
            {m.performance && (
              <Link href={`/${m.number}/referral`}>
                <span>#{format(m.number)}</span>
                <span className="reward-card-label">Referral reward</span>
                <strong>${format(m.performance.rewardUsd)}</strong>
                <ReferralLeaderboard number={m.number} compact />
                <small>
                  {m.performance.status === "future"
                    ? m.number === next?.number
                      ? "In progress"
                      : "Upcoming"
                    : (rewardLabels[m.performance.status] ?? "Under review")}
                </small>
              </Link>
            )}
          </div>
        ))}
      </nav>
    </section>
  );
}
export function PrizeGuide() {
  return (
    <>
      <p>
        A $4.99 purchase puts your content on the live wall. When milestone
        rewards are available, a qualifying takeover number also starts a reward
        claim. A purchase does not guarantee a prize.
      </p>
      <p>
        Where dual rewards are enabled in the current rules, the preceding
        cohort’s verified referral leader can receive a separate reward of equal
        value. It requires at least one verified referral. Ties use unique
        visitors, then the earlier takeover number. Failed claims pass to the
        next eligible ranked entrant; no qualifying entrant means no referral
        reward.
      </p>
      <p>
        See the current Reward Rules for the free email entry method. Free
        placements receive the next available number when processed, under the
        same reward criteria.
      </p>
      <ol className="how-it-works">
        <li>
          <h3>Your number comes from activation</h3>
          <p>
            Opening checkout does not reserve a number. Numbers are assigned in
            successful activation order, so another takeover can activate before
            yours. Counted admin-issued placements also advance the sequence and
            are labeled publicly; uncounted house placements do not.
          </p>
        </li>
        <li>
          <h3>A milestone starts a claim</h3>
          <p>
            At a configured milestone, its takeover becomes the provisional
            recipient. We email a protected claim link to the recipient’s email
            address. Open it and verify with a fresh email code.
          </p>
        </li>
        <li>
          <h3>Submit your claim by its deadline</h3>
          <p>
            Check the deadline in your claim portal, submit the requested
            eligibility information and respond to any document requests.
            Availability depends on your location, eligibility and permitted
            payout options. Internal review time does not count against your
            response deadline.
          </p>
        </li>
        <li>
          <h3>Verification comes before a winner</h3>
          <p>
            After approval, payout is handled manually. The permanent winner
            page is published only after payout confirmation. Your temporary
            live placement may already have been replaced.
          </p>
        </li>
        <li>
          <h3>If a recipient cannot qualify</h3>
          <p>
            An ineligible or expired claim passes to the next takeover in
            sequence. There is no random redraw or hand-picked replacement. If
            that takeover does not exist yet, the reward waits for it.
          </p>
        </li>
      </ol>
      <p>
        <strong>
          The live wall is temporary. A finalized winner page is permanent.
        </strong>{" "}
        Neither a takeover number nor a claim email guarantees payment before
        eligibility review and payout confirmation.
      </p>
      <p>
        <Link href="/?info=rewards">
          Read the current Reward Rules, amounts and deadlines →
        </Link>
      </p>
    </>
  );
}
