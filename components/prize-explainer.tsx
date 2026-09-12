import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
type Overview = FunctionReturnType<typeof api.rewards.overview>;
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
      {!!data.numberingOffset && (
        <p className="numbering-note">Public takeover numbers include a starting offset of {data.numberingOffset}. The offset is not a set of completed takeovers; prizes follow the public milestone numbers.</p>
      )}
      {demo && (
        <p className="demo-progress-notice">
          <strong>DEMO PROGRESS</strong> — Displayed progress combines real
          takeovers and demo additions. No number is reserved and no prize is
          earned. Milestone links below show real records.
        </p>
      )}
      <div className="prize-intro">
        <span className="eyebrow">YOUR PURCHASE & THE PRIZES</span>
        <h2 id="prize-title">$3.99 BUYS YOUR TIME ON THE WALL.</h2>
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
        <Link href="/?info=how-prizes-work">How prizes work →</Link>
      </div>
      {next ? (
        <div className="prize-next">
          <span>
            {demo ? "DEMO · " : ""}NEXT PRIZE MILESTONE · #{format(next.number)}
          </span>
          <strong>${format(next.rewardUsd)} REWARD</strong>
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
      <ol className="prize-steps">
        <li>
          <span>01</span>
          <div>
            <h3>Publish for $3.99</h3>
            <p>Get your number when your takeover goes live.</p>
          </div>
        </li>
        <li>
          <span>02</span>
          <div>
            <h3>Hit a prize number</h3>
            <p>We email you a link to start your claim.</p>
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
      <p className="prize-admin-note">
        <strong>What counts?</strong> Paid takeovers and counted admin
        placements advance the number. Counted admin placements skip payment but
        can qualify for prizes; they are labeled publicly. Uncounted placements
        do neither. <Link href="/?info=how-prizes-work">Details & rules →</Link>
      </p>
      <nav className="prize-milestones" aria-label="Prize milestones">
        {ordered.map((m) => (
          <Link href={`/${m.number}`} key={m.number}>
            <span>#{format(m.number)}</span>
            <strong>${format(m.rewardUsd)}</strong>
            <small>
              {m.status === "future"
                ? m.number === next?.number
                  ? "In progress"
                  : "Upcoming"
                : m.status === "paid"
                  ? "Winner confirmed"
                  : "Verification in progress"}
            </small>
          </Link>
        ))}
      </nav>
    </section>
  );
}
export function PrizeGuide() {
  return (
    <>
      <p>
        A $3.99 purchase puts your content on the live wall. When milestone
        rewards are available, a qualifying takeover number also starts a reward
        claim. A purchase does not guarantee a prize.
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
