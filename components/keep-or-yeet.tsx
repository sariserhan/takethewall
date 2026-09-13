"use client";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
export function KeepOrYeet({ takeoverId, name }: { takeoverId: Id<"takeovers">; name: string }) {
  const totals = useQuery(api.wallVotes.totals, { takeoverId });
  const [choice, setChoice] = useState<"keep" | "yeet" | null>(null),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    fetch(`/api/wall-vote?takeoverId=${encodeURIComponent(takeoverId)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((data) => {
        if (alive) setChoice(data.choice);
      })
      .catch(() => {
        if (alive)
          setMessage(
            "Your previous vote could not be loaded. You can vote again to update it.",
          );
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [takeoverId]);
  if (!totals) return null;
  const total = totals.keep + totals.yeet;
  const keep = total ? Math.round((totals.keep / total) * 100) : 0;
  async function vote(next: "keep" | "yeet") {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/wall-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeoverId, choice: next }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error ?? "Could not save your vote.");
      setChoice(data.choice);
      setMessage("Vote saved. You can change your mind.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save your vote.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="keep-or-yeet" aria-labelledby="keep-yeet-title">
      <div>
        <p className="eyebrow">AUDIENCE REACTION</p>
        <h2 id="keep-yeet-title">KEEP OR YEET?</h2>
        <p className="vote-content-name">{name}</p>
        <p>Just for fun. Votes never change the price or remove the owner.</p>
      </div>
      <div className="vote-controls">
        <button
          disabled={busy}
          aria-pressed={choice === "keep"}
          onClick={() => void vote("keep")}
        >
          KEEP · {total ? keep + "%" : "—"}
        </button>
        <button
          disabled={busy}
          aria-pressed={choice === "yeet"}
          onClick={() => void vote("yeet")}
        >
          YEET · {total ? 100 - keep + "%" : "—"}
        </button>
      </div>
      <div className="vote-bar" aria-hidden="true">
        <span style={{ width: (total ? keep : 0) + "%" }} />
      </div>
      <p className="field-note">
        {total.toLocaleString("en-US")} {total === 1 ? "vote" : "votes"} · One
        changeable vote per browser for this takeover.
      </p>
      <p role="status">{message}</p>
    </section>
  );
}
