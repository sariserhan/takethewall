"use client";
import { useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ReportContent } from "./report-content";
export function WhisperRoom({
  takeoverId,
  admin = false,
}: {
  takeoverId: Id<"takeovers">;
  admin?: boolean;
}) {
  const {
    results,
    status: historyStatus,
    loadMore,
  } = usePaginatedQuery(
    api.whispers.history,
    { takeoverId },
    { initialNumItems: 50 },
  );
  const rows = [...results].reverse();
  const remove = useMutation(api.whispers.remove);
  const [text, setText] = useState(""),
    [company, setCompany] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="whisper-room">
      <p>
        Anonymous spectator comments. Keep it kind. Messages stay for this
        owner’s entire reign. The room resets when a new takeover goes live.
      </p>
      {(historyStatus === "CanLoadMore" || historyStatus === "LoadingMore") && (
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
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setStatus("");
            try {
              const r = await fetch("/api/whisper", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ takeoverId, text, company }),
              });
              const result = await r.json();
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
          <button disabled={busy}>Send whisper</button>
        </form>
      )}
      <p role="status">{status}</p>
      {!admin && (
        <ReportContent
          takeoverId={takeoverId}
          name="Whisper room — include the comment in your report"
        />
      )}
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
