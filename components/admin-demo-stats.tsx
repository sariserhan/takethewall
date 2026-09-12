"use client";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
const defaults = {
  visitorsToday: 0,
  totalVisitors: 0,
  impressions: 0,
  uniqueVisitors: 0,
  clicks: 0,
};
const labels = {
  visitorsToday: "Visitors today",
  totalVisitors: "Total visitors",
  impressions: "Impressions",
  uniqueVisitors: "Unique visitors",
  clicks: "Clicks",
};
export function AdminDemoStats() {
  const saved = useQuery(api.demoStats.read);
  const wall = useQuery(api.wall.current);
  if (saved === undefined || wall === undefined)
    return <p>Loading demo settings…</p>;
  if (!wall)
    return (
      <p>
        Publish a house placement first, then configure its labeled demo
        statistics.
      </p>
    );
  return (
    <DemoForm
      key={wall.owner.id}
      ownerId={wall.owner.id}
      saved={saved}
    />
  );
}
function DemoForm({
  ownerId,
  saved,
}: {
  ownerId: Id<"takeovers">;
  saved: { values: typeof defaults; activeForCurrentOwner: boolean } | null;
}) {
  const save = useMutation(api.demoStats.save);
  const [values, setValues] = useState(saved?.values ?? defaults);
  const [enabled, setEnabled] = useState(saved?.activeForCurrentOwner ?? false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="admin-detail">
      <h2>Demo stats</h2>
      <p>
        Display labeled sample numbers for the current wall. Each sample has a
        Demo badge and a notice explaining it is not measured traffic. Real
        counting continues underneath. Changing the wall owner ends this demo
        automatically.
      </p>
      <p>
        Payments, takeover numbers, prize progress, previous owners and
        timestamps always use real records.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            await save({ enabled, values, reason, expectedCurrentId: ownerId });
            setMessage("Demo settings saved.");
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="check-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Show labeled demo stats
        </label>
        {Object.entries(labels).map(([key, label]) => (
          <label key={key}>
            {label} — sample
            <input
              type="number"
              min="0"
              max="1000000000"
              step="1"
              required
              value={values[key as keyof typeof values]}
              onChange={(e) =>
                setValues({ ...values, [key]: e.target.valueAsNumber })
              }
            />
          </label>
        ))}
        <p>Demo CTR is calculated from sample clicks and impressions.</p>
        <label>
          Reason for change
          <input
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button disabled={busy} type="submit">
          {busy ? "Saving…" : "Save demo settings"}
        </button>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}
