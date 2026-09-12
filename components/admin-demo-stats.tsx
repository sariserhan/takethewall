"use client";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
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
  return <DemoForm key={wall.owner.id} ownerId={wall.owner.id} saved={saved} />;
}
function DemoForm({
  ownerId,
  saved,
}: {
  ownerId: Id<"takeovers">;
  saved: FunctionReturnType<typeof api.demoStats.read>;
}) {
  const save = useMutation(api.demoStats.save);
  const [values, setValues] = useState(saved?.values ?? defaults);
  const [enabled, setEnabled] = useState(saved?.activeForCurrentOwner ?? false);
  const [previewEnabled, setPreviewEnabled] = useState(!!saved?.presentation);
  const [presentation, setPresentation] = useState(
    () =>
      saved?.presentation ?? {
        displayName: "Demo owner",
        description: "Sample wall content",
        websiteUrl: "",
        ownerSince: Date.now(),
        previousOwnerName: "Demo previous owner",
        takeoverCount: 0,
      },
  );
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="admin-detail">
      <h2>Demo stats</h2>
      <p>
        Add labeled demo amounts to the current wall’s real counts. Each total
        is labeled Includes-demo. For example, 10 real visitors plus 10
        demo visitors displays 20. Real counting continues underneath. Changing
        the wall owner ends this demo automatically.
      </p>
      <p>
        Real ownership, payments, prize claims and permanent winner pages are
        never changed. Optional content and progress previews are explicitly
        labeled.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            await save({
              enabled,
              values,
              reason,
              expectedCurrentId: ownerId,
              ...(previewEnabled ? { presentation } : {}),
            });
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
            {label} — demo addition
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
        <p>
          Displayed CTR uses combined real + demo clicks and impressions.
          Turning demo off reveals only the real counts.
        </p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={previewEnabled}
            onChange={(e) => setPreviewEnabled(e.target.checked)}
          />
          Preview content and progress too
        </label>
        {previewEnabled && (
          <fieldset>
            <legend>Labeled demo presentation</legend>
            <label>
              Demo owner name
              <input
                required
                maxLength={60}
                value={presentation.displayName}
                onChange={(e) =>
                  setPresentation({
                    ...presentation,
                    displayName: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Demo message
              <input
                maxLength={120}
                value={presentation.description}
                onChange={(e) =>
                  setPresentation({
                    ...presentation,
                    description: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Demo destination URL (optional)
              <input
                type="url"
                value={presentation.websiteUrl}
                onChange={(e) =>
                  setPresentation({
                    ...presentation,
                    websiteUrl: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Demo owner since (UTC)
              <input
                type="datetime-local"
                required
                step="1"
                value={
                  Number.isFinite(presentation.ownerSince)
                    ? new Date(presentation.ownerSince)
                        .toISOString()
                        .slice(0, 19)
                    : ""
                }
                onChange={(e) =>
                  setPresentation({
                    ...presentation,
                    ownerSince: Date.parse(e.target.value + "Z"),
                  })
                }
              />
            </label>
            <label>
              Demo previous owner
              <input
                maxLength={60}
                value={presentation.previousOwnerName}
                onChange={(e) =>
                  setPresentation({
                    ...presentation,
                    previousOwnerName: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Demo takeover addition / progress
              <input
                type="number"
                required
                min="0"
                max="1000000000"
                step="1"
                value={presentation.takeoverCount}
                onChange={(e) =>
                  setPresentation({
                    ...presentation,
                    takeoverCount: e.target.valueAsNumber,
                  })
                }
              />
            </label>
            <p>
              Demo content uses no real owner’s image. Links and dates are
              samples; milestone links still open the real permanent pages.
            </p>
          </fieldset>
        )}
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
