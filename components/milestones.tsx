"use client";
import { Arrow } from "./arrow";
import { LoadingSkeleton } from "./loading-skeleton";
import { PrizeExplainer } from "./prize-explainer";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { BackendProvider } from "./backend-provider";
import { Dialog } from "./dialog";
import { contentCta } from "@/lib/content";
import { duration, ctr } from "@/lib/validation";
function TrophyIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M7 3h10v6a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 14v5m-5 2h10M9 19h6" />
    </svg>
  );
}
type Milestone = FunctionReturnType<
  typeof api.rewards.overview
>["milestones"][number];
export function Sequence({ milestone }: { milestone: Milestone }) {
  return (
    <ol className="milestone-sequence">
      {milestone.sequence.map((r) => (
        <li
          key={r.number}
          className={r.number === milestone.candidateNumber ? "candidate" : ""}
        >
          <strong>#{r.number}</strong>
          <span>{r.displayName ?? "— waiting"}</span>
          {r.status && (
            <small>{r.status.replaceAll("_", " ").toUpperCase()}</small>
          )}
          {r.auditHash && (
            <details>
              <summary>Audit</summary>
              <span>{r.publicTakeoverId}</span>
              <code>{r.auditHash}</code>
              <time>
                {r.activatedAt ? new Date(r.activatedAt).toUTCString() : ""}
              </time>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}
export function HomepageMilestones() {
  const data = useQuery(api.rewards.overview);
  const [selected, setSelected] = useState<number | null>(null),
    [dismissed, setDismissed] = useState<number[]>(() => {
      if (typeof window === "undefined") return [];
      try {
        return Object.keys(sessionStorage)
          .filter((k) => k.startsWith("dismissedMilestoneOverlay:"))
          .map((k) => Number(k.split(":")[1]));
      } catch {
        return [];
      }
    }),
    [mobileOpen, setMobileOpen] = useState(false);
  if (!data) return null;
  const unresolved = data.milestones.filter(
    (m) => !["future", "paid"].includes(m.status),
  );
  const active =
    unresolved.find((m) => m.number === selected) ?? unresolved.at(-1);
  const show = active && !dismissed.includes(active.number);
  return (
    <>
      <PrizeExplainer data={data} />
      {active && (
        <>
          <button
            className="milestone-pill"
            onClick={() => {
              setMobileOpen(true);
              setDismissed(dismissed.filter((n) => n !== active.number));
            }}
          >
            <TrophyIcon />{" "}
            {data.promotionEnabled
              ? `$${active.rewardUsd.toLocaleString("en-US")}`
              : `#${active.number}`}{" "}
            verification
          </button>
          {show && (
            <aside className="milestone-overlay">
              <button
                aria-label="Dismiss milestone verification"
                className="dismiss"
                onClick={() => {
                  setDismissed([...dismissed, active.number]);
                  try {
                    sessionStorage.setItem(
                      `dismissedMilestoneOverlay:${active.number}`,
                      "1",
                    );
                  } catch {}
                }}
              >
                ×
              </button>
              <h3>
                <TrophyIcon /> MILESTONE #
                {active.number.toLocaleString("en-US")}
              </h3>
              <p>Verification in progress</p>
              {unresolved.length > 1 && (
                <select
                  aria-label="Milestone being verified"
                  value={active.number}
                  onChange={(e) => setSelected(Number(e.target.value))}
                >
                  {unresolved.map((m) => (
                    <option key={m.number} value={m.number}>
                      #{m.number}
                    </option>
                  ))}
                </select>
              )}
              <Sequence milestone={active} />
              <Link href={`/${active.number}`}>View milestone →</Link>
            </aside>
          )}
          <Dialog
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            title={`MILESTONE #${active.number}`}
          >
            <p>Verification in progress</p>
            {unresolved.length > 1 && (
              <select
                aria-label="Milestone being verified"
                value={active.number}
                onChange={(e) => setSelected(Number(e.target.value))}
              >
                {unresolved.map((m) => (
                  <option key={m.number} value={m.number}>
                    #{m.number}
                  </option>
                ))}
              </select>
            )}
            <Sequence milestone={active} />
            <Link href={`/${active.number}`}>View milestone →</Link>
          </Dialog>
        </>
      )}
    </>
  );
}
export function MilestonePage({ number }: { number: number }) {
  return (
    <BackendProvider>
      <MilestoneView number={number} />
    </BackendProvider>
  );
}
function MilestoneView({ number }: { number: number }) {
  const data = useQuery(api.rewards.overview);
  if (!data) return <LoadingSkeleton label="Loading milestone" />;
  const m = data.milestones.find((m) => m.number === number);
  if (!m) return <p>This milestone is unavailable.</p>;
  const trophy = m.snapshot;
  return (
    <>
      <div className="permanent-heading">
        <p className="eyebrow">
          PERMANENT WALL / #{number.toLocaleString("en-US")}
        </p>
        <h1>
          {data.promotionEnabled
            ? `THE $${m.rewardUsd.toLocaleString("en-US")} WALL`
            : `THE #${number.toLocaleString("en-US")} WALL`}
        </h1>
        <p className="permanent-lede">
          {m.status === "future"
            ? "The live wall changes hands. This place in history stays."
            : m.status === "paid"
              ? "One takeover. A permanent place in wall history."
              : "The milestone is reached. The winner is being verified."}
        </p>
      </div>
      {m.status === "future" ? (
        <div className="permanent-future">
          <div className="permanent-placeholder">
            <span className="permanent-status">NO OWNER YET</span>
            <div className="permanent-emblem" aria-hidden="true">
              <TrophyIcon />
            </div>
            <h2>
              A PLACE IN HISTORY.
              <br />
              WAITING FOR ITS OWNER.
            </h2>
            <p>
              This wall becomes the verified winner’s permanent page after
              payout confirmation.
            </p>
            <span className="permanent-address">takethewall.com/{number}</span>
          </div>
          <div className="permanent-details">
            <section
              className="permanent-progress"
              aria-label="Milestone progress"
            >
              <span className="eyebrow">
                THE ROAD TO #{number.toLocaleString("en-US")}
              </span>
              <div className="permanent-count">
                <strong>{data.currentNumber.toLocaleString("en-US")}</strong>
                <span>/ {number.toLocaleString("en-US")}</span>
              </div>
              <progress
                aria-label={`Takeovers toward milestone ${number}`}
                value={Math.min(data.currentNumber, number)}
                max={number}
              />
              <p>
                <strong>
                  {Math.max(0, number - data.currentNumber).toLocaleString(
                    "en-US",
                  )}
                </strong>{" "}
                takeovers to go.
              </p>
            </section>
            {data.promotionEnabled ? (
              <section className="permanent-benefits">
                <h2>THE VERIFIED WINNER RECEIVES</h2>
                <div className="permanent-reward">
                  <strong>${m.rewardUsd.toLocaleString("en-US")}</strong>
                  <span>
                    milestone reward
                    <br />
                    subject to eligibility
                  </span>
                </div>
                <ul>
                  <li>Permanent placement on /{number}</li>
                  <li>Your image, name and message</li>
                  <li>Your original takeover statistics</li>
                </ul>
              </section>
            ) : (
              <p>
                See Reward Rules for current reward availability and
                eligibility.
              </p>
            )}
            <Link className="button permanent-cta" href="/?take=1">
              TAKE THE LIVE WALL — $3.99 <Arrow />
            </Link>
            <p className="permanent-purchase-note">
              A purchase takes the live wall. A milestone starts a claim,
              subject to verification.
            </p>
          </div>
        </div>
      ) : m.status !== "paid" ? (
        <div className="permanent-verifying">
          <h2>MILESTONE REACHED</h2>
          <p>Winner verification in progress.</p>
          <p>Provisional recipient: takeover #{m.candidateNumber}</p>
          <Sequence milestone={m} />
        </div>
      ) : trophy ? (
        <>
          <div className="trophy-ad">
            {m.logoUrl && (
              <Image
                src={m.logoUrl}
                width={200}
                height={200}
                unoptimized
                alt={trophy.displayName}
              />
            )}
            <h2>{trophy.displayName}</h2>
            <p>{trophy.description}</p>
            {trophy.contentType !== "personal" && m.outboundLinkEnabled && (
              <a
                className="button"
                href={trophy.websiteUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
              >
                {contentCta(trophy.linkType)} →
              </a>
            )}
          </div>
          <dl className="trophy-stats">
            <div>
              <dt>WINNING TAKEOVER</dt>
              <dd>#{m.candidateNumber}</dd>
            </div>
            <div>
              <dt>REWARD</dt>
              <dd>${m.rewardUsd.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>AWARDED</dt>
              <dd>
                {m.paidAt
                  ? new Date(m.paidAt).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>ORIGINAL REIGN</dt>
              <dd>
                {trophy.replacedAt
                  ? duration(trophy.replacedAt - trophy.activatedAt)
                  : "Still active"}
              </dd>
            </div>
            <div>
              <dt>IMPRESSIONS</dt>
              <dd>{trophy.impressions.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>CLICKS</dt>
              <dd>{trophy.clicks.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>CTR</dt>
              <dd>{ctr(trophy.impressions, trophy.clicks).toFixed(2)}%</dd>
            </div>
          </dl>
          <p>
            {trophy.statsFrozen
              ? "Original statistics frozen."
              : "Original-reign analytics are live until the late-event window ends."}
          </p>
          <h2>THIS WALL IS THEIRS FOREVER.</h2>
          <Link href="/">Fight for the live wall →</Link>
          <details>
            <summary>Public sequence and audit</summary>
            <Sequence milestone={m} />
          </details>
        </>
      ) : null}
      <p className="permanent-rules">
        <Link href={`/rewards?version=${encodeURIComponent(m.rulesVersion)}`}>
          Read the Reward Rules
        </Link>{" "}
        · Subject to eligibility.
      </p>
      {m.rulesHash && (
        <details>
          <summary>Rules hash</summary>
          <code>{m.rulesHash}</code>
        </details>
      )}
    </>
  );
}
export function RewardRules({ version }: { version?: string }) {
  return (
    <BackendProvider>
      <RulesView version={version} />
    </BackendProvider>
  );
}
function RulesView({ version }: { version?: string }) {
  const rules = useQuery(api.rewards.rules, version ? { version } : {});
  if (!rules) return <p>Loading Reward Rules…</p>;
  const parsed = JSON.parse(rules.json);
  return (
    <>
      <p className="eyebrow">VERSION {rules.version}</p>
      {Object.entries(parsed).map(([key, value]) => (
        <section key={key}>
          <h2>{key.replaceAll(/([A-Z])/g, " $1").toUpperCase()}</h2>
          {Array.isArray(value) ? (
            <ul>
              {value.map((m: { takeoverNumber: number; rewardUsd: number }) => (
                <li key={m.takeoverNumber}>
                  #{m.takeoverNumber.toLocaleString("en-US")} → $
                  {m.rewardUsd.toLocaleString("en-US")}
                </li>
              ))}
            </ul>
          ) : (
            <p>{String(value)}</p>
          )}
        </section>
      ))}
      <details>
        <summary>Canonical rules and SHA-256 hash</summary>
        <code>{rules.hash}</code>
        <pre>{rules.json}</pre>
      </details>
    </>
  );
}
