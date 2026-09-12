"use client";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TakeoverShare } from "./takeover-share";
export function AdminGrowth() {
  const [before, setBefore] = useState<number | undefined>();
  const page = useQuery(api.growth.adminHistory, {
    ...(before ? { before } : {}),
  });
  const feedback = useQuery(api.owners.recentFeedback, {});
  const enabled = useQuery(api.growth.visibility, {});
  const toggle = useMutation(api.growth.setHistoryVisibility);
  const [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  return (
    <section>
      <h2>Growth & sharing</h2>
      <details className="owner-feedback">
        <summary>
          Owner feedback · {feedback?.length ?? "…"} recent responses
        </summary>
        <p>
          Latest 50 answers to “Was your takeover worth $3.99?” Test responses
          are labeled separately.
        </p>
        {feedback?.length === 0 && <p>No owner feedback yet.</p>}
        {feedback?.map((row, i) => (
          <p key={row.publicId ?? i}>
            <strong>{row.name}</strong> —{" "}
            {row.answer === "unsure"
              ? "Not sure"
              : row.answer === "yes"
                ? "Yes"
                : "No"}{" "}
            · {new Date(row.at).toISOString().slice(0, 16).replace("T", " ")}{" "}
            UTC ·{" "}
            {row.environment === "production"
              ? "Live purchase"
              : "Test purchase"}
          </p>
        ))}
      </details>
      <p>
        Prepare posts from public takeover content, inspect referral results,
        and review pages for search.
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={enabled ?? false}
          disabled={enabled === undefined || saving}
          onChange={async (e) => {
            setSaving(true);
            setError("");
            try {
              await toggle({ enabled: e.target.checked });
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not update visibility.",
              );
            } finally {
              setSaving(false);
            }
          }}
        />
        Show Wall History publicly
      </label>
      <p className="field-note">
        When off, the archive, public history links, and its sitemap entry are
        hidden. Individual takeover share pages remain available.
      </p>
      {before && (
        <button onClick={() => setBefore(undefined)}>Latest takeovers</button>
      )}
      <p role="alert">{error}</p>
      <div className="owner-share-actions">
        {page?.entries.map((t) => (
          <button
            key={t.publicId}
            aria-pressed={selected === t.publicId}
            onClick={() => setSelected(t.publicId)}
          >
            {t.name}
          </button>
        ))}
      </div>
      {page && !page.entries.length && <p>No public takeovers on this page.</p>}
      {page?.next && (
        <button onClick={() => setBefore(page.next ?? undefined)}>
          Older takeovers →
        </button>
      )}
      <label>
        Public takeover ID
        <input
          value={selected}
          onChange={(e) => setSelected(e.target.value.trim())}
          placeholder="ttw_…"
        />
      </label>
      {/^ttw_[a-f0-9]{32}$/.test(selected) && (
        <Kit
          key={selected}
          publicId={selected}
          name={
            page?.entries.find((t) => t.publicId === selected)?.name ??
            "This project"
          }
        />
      )}
    </section>
  );
}
function Kit({ publicId, name }: { publicId: string; name: string }) {
  const data = useQuery(api.growth.kit, { publicId });
  const review = useMutation(api.growth.review);
  const [reviewedRevision, setReviewedRevision] = useState<number | null>(null);
  const [summary, setSummary] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  if (data === undefined) return <p role="status">Loading takeover…</p>;
  if (!data) return <p>This takeover is unavailable.</p>;
  const save = async (approved: boolean) => {
    setBusy(true);
    try {
      await review({
        publicId,
        summary: summary ?? data.summary,
        approved,
        expectedRevision: reviewedRevision ?? data.revision,
      });
      setMessage(
        approved
          ? "Approved for search discovery. Search engines decide whether and when to index it."
          : "Search approval removed.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save review.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <TakeoverShare
        publicId={publicId}
        name={name}
        revision={data.revision}
        editorial
      />
      <h3>Shared link results</h3>
      <p>
        {data.visitors} unique referred browsers · {data.purchases} paid
        takeovers
      </p>
      <p className="field-note">
        Production measurements only. Last shared link within 30 days gets
        purchase credit; identifiable self-referrals are excluded.
      </p>
      <section className="growth-review">
        <h3>Search review · {data.approved ? "Approved" : "Not approved"}</h3>
        <p>
          Approve only useful, original pages after reviewing their content and
          destination. Your overview appears publicly. Owner edits invalidate
          approval until reviewed again.
        </p>
        <label>
          Editorial overview
          <textarea
            maxLength={2000}
            rows={5}
            value={summary ?? data.summary}
            onChange={(e) => {
              setReviewedRevision(reviewedRevision ?? data.revision);
              setSummary(e.target.value);
            }}
          />
        </label>
        <div className="owner-share-actions">
          <button disabled={busy} onClick={() => void save(true)}>
            Approve for search
          </button>
          <button disabled={busy} onClick={() => void save(false)}>
            Remove approval
          </button>
        </div>
        <p role="status">{message}</p>
      </section>
    </>
  );
}
