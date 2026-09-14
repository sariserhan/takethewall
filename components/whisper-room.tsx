"use client";
import { useEffect, useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog } from "./dialog";
import { ReportContent } from "./report-content";
export function WhisperRoom({
  takeoverId,
  admin = false,
  compact = false,
}: {
  takeoverId: Id<"takeovers">;
  admin?: boolean;
  compact?: boolean;
}) {
  const {
    results,
    status: historyStatus,
    loadMore,
  } = usePaginatedQuery(
    api.whispers.history,
    { takeoverId },
    { initialNumItems: compact ? 3 : 50 },
  );
  const rows = (compact ? results.slice(0, 3) : [...results]).reverse();
  const remove = useMutation(api.whispers.remove);
  const [text, setText] = useState(""),
    [company, setCompany] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const [retryIn, setRetryIn] = useState(0);
  useEffect(() => {
    if (retryIn <= 0) return;
    const timer = window.setTimeout(
      () => setRetryIn((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [retryIn]);
  return (
    <section className="whisper-room">
      <p>
        Anonymous spectator comments. Keep it kind. Messages stay for this
        owner’s entire reign. The room resets when a new takeover goes live.
      </p>
      {!compact &&
        (historyStatus === "CanLoadMore" ||
          historyStatus === "LoadingMore") && (
          <button
            disabled={historyStatus === "LoadingMore"}
            onClick={() => loadMore(50)}
          >
            {historyStatus === "LoadingMore"
              ? "Loading older whispers…"
              : "Load older whispers"}
          </button>
        )}
      <div
        className="whisper-log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {historyStatus === "LoadingFirstPage" ? (
          <p>Loading room…</p>
        ) : !rows.length ? (
          <p>No whispers yet. Start the conversation.</p>
        ) : (
          rows.map((r) => (
            <p key={r.id}>
              <small>
                Spectator · {new Date(r.createdAt).toISOString().slice(11, 19)}{" "}
                UTC
              </small>
              <br />
              {r.text}{" "}
              {admin && (
                <button
                  onClick={async () => {
                    try {
                      await remove({ id: r.id });
                    } catch {
                      setStatus("Could not remove message.");
                    }
                  }}
                >
                  Remove
                </button>
              )}
            </p>
          ))
        )}
      </div>
      {!admin && (
        <form
          className="whisper-compose"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || retryIn > 0) return;
            setBusy(true);
            setStatus("");
            try {
              const r = await fetch("/api/whisper", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ takeoverId, text, company }),
              });
              const result = await r.json();
              if (r.status === 429) {
                const seconds = Number(r.headers.get("Retry-After"));
                setRetryIn(
                  Number.isFinite(seconds) && seconds > 0
                    ? Math.min(300, Math.ceil(seconds))
                    : 60,
                );
              }
              if (!r.ok) throw Error(result.error ?? "Could not post.");
              setText("");
              setStatus("Posted.");
            } catch (e) {
              setStatus(e instanceof Error ? e.message : "Could not post.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Your whisper
            <input
              required
              placeholder="What do you think?"
              maxLength={50}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <input
            className="honeypot"
            aria-hidden="true"
            tabIndex={-1}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
          <button type="submit" disabled={busy || retryIn > 0}>
            {busy
              ? "Sending…"
              : retryIn > 0
                ? `Try again in ${retryIn}s`
                : "Send whisper"}
          </button>
        </form>
      )}
      <div className="whisper-footer">
        <p role="status">{status}</p>
        {!admin && (
          <>
            <p className="whisper-limit-note">
              Up to 3 whispers per minute per connection. Shared networks share
              this limit.
            </p>
            <ReportContent
              takeoverId={takeoverId}
              name="Whisper room — include the comment in your report"
            />
          </>
        )}
      </div>
    </section>
  );
}
export function AdminWhispers() {
  const wall = useQuery(api.wall.current);
  return (
    <details>
      <summary>Moderate live Whisper room</summary>
      {wall?.owner && <WhisperRoom admin takeoverId={wall.owner.id} />}
    </details>
  );
}

export function WhisperPreview({
  takeoverId,
  name,
}: {
  takeoverId: Id<"takeovers">;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section
      className="whisper-preview"
      aria-labelledby="whisper-preview-title"
    >
      <header className="whisper-preview-heading">
        <div>
          <p className="eyebrow">THE CONVERSATION</p>
          <h2 id="whisper-preview-title">Whispers about {name}</h2>
        </div>
        <button className="wall-action" onClick={() => setOpen(true)}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M3 4h18v13H9l-6 4V4Z M7 9h10 M7 13h6" />
          </svg>
          View conversation
        </button>
      </header>
      <WhisperRoom takeoverId={takeoverId} compact />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Whispers about ${name}`}
        wide
      >
        {open && <WhisperRoom takeoverId={takeoverId} />}
      </Dialog>
    </section>
  );
}
