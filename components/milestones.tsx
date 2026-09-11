"use client";
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
  const next = data.milestones.find((m) => m.number > data.currentNumber);
  const show = active && !dismissed.includes(active.number);
  return (
    <>
      {next && data.promotionEnabled && (
        <section className="milestone-progress">
          <span>NEXT MILESTONE #{next.number.toLocaleString("en-US")}</span>
          <strong>${next.rewardUsd.toLocaleString("en-US")} REWARD*</strong>
          <p>
            {(next.number - data.currentNumber).toLocaleString("en-US")}{" "}
            takeovers to go
          </p>
          <small>
            *Subject to eligibility and{" "}
            <Link href="/rewards">Reward Rules</Link>.
          </small>
        </section>
      )}
      <section className="permanent-walls">
        <h2>PERMANENT WALLS</h2>
        <div>
          {data.milestones.map((m) => (
            <Link key={m.number} href={`/${m.number}`}>
              <span>
                <TrophyIcon /> #{m.number.toLocaleString("en-US")}
              </span>
              <strong>
                {data.promotionEnabled
                  ? `The $${m.rewardUsd.toLocaleString("en-US")} Wall`
                  : `Milestone #${m.number.toLocaleString("en-US")}`}
              </strong>
              <small>
                {m.status === "paid"
                  ? m.snapshot?.displayName
                  : m.status === "future"
                    ? `${Math.max(0, m.number - data.currentNumber).toLocaleString("en-US")} to go`
                    : "Verification in progress"}
              </small>
            </Link>
          ))}
        </div>
      </section>
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
  if (!data) return <p>Loading milestone…</p>;
  const m = data.milestones.find((m) => m.number === number);
  if (!m) return <p>This milestone is unavailable.</p>;
  const trophy = m.snapshot;
  return (
    <>
      <p className="eyebrow">MILESTONE #{number.toLocaleString("en-US")}</p>
      <h1>
        {data.promotionEnabled
          ? `THE $${m.rewardUsd.toLocaleString("en-US")} WALL`
          : `THE #${number.toLocaleString("en-US")} WALL`}
      </h1>
      {m.status === "future" ? (
        <>
          <h2>NO OWNER YET</h2>
          <p>
            Current progress: {data.currentNumber.toLocaleString("en-US")} /{" "}
            {number.toLocaleString("en-US")}
          </p>
          <progress value={Math.min(data.currentNumber, number)} max={number} />
          <p>
            {Math.max(0, number - data.currentNumber).toLocaleString("en-US")}{" "}
            takeovers to go.
          </p>
          {data.promotionEnabled ? (
            <>
              <h2>THE VERIFIED WINNER RECEIVES</h2>
              <ul>
                <li>
                  ${m.rewardUsd.toLocaleString("en-US")} milestone reward,
                  subject to eligibility
                </li>
                <li>Permanent placement on /{number}</li>
                <li>Your winning image and description or message</li>
                <li>
                  Original takeover statistics and a place in wall history
                </li>
              </ul>
            </>
          ) : (
            <p>
              See Reward Rules for current reward availability and eligibility.
            </p>
          )}
          <Link className="button" href="/?take=1">
            FIGHT FOR THE LIVE WALL — $3.99
          </Link>
        </>
      ) : m.status !== "paid" ? (
        <>
          <h2>MILESTONE REACHED</h2>
          <p>Winner verification in progress.</p>
          <p>Provisional recipient: takeover #{m.candidateNumber}</p>
          <Sequence milestone={m} />
        </>
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
      <p>
        <Link href={`/rewards?version=${encodeURIComponent(m.rulesVersion)}`}>
          Reward Rules {m.rulesVersion}
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
