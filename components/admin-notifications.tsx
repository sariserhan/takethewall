"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
export function AdminNotifications() {
  const value = useQuery(api.admin.getNotificationSettings),
    save = useMutation(api.admin.saveNotificationSettings);
  const [draft, setDraft] = useState<{
      enabled: boolean;
      recipient: string;
      revision: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (!value) return <p role="status">Loading notification settings…</p>;
  const current = draft ?? value;
  return (
    <section className="admin-notifications">
      <h2>Takeover notifications</h2>
      <p>
        Receive an email whenever a paid takeover or admin publication goes
        live.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setNotice("");
          try {
            await save({
              enabled: current.enabled,
              recipient: current.recipient,
              expectedRevision: current.revision,
            });
            setDraft(null);
            setNotice("Notification settings saved.");
          } catch (e) {
            setNotice(
              e instanceof Error ? e.message : "Could not save settings.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label className="check-label">
            <input
              type="checkbox"
              checked={current.enabled}
              onChange={(e) => setDraft({ ...current, enabled: e.target.checked })}
            />
            <span className="check-copy">Email me when someone takes the wall</span>
          </label>
          <label>
            Notification recipient
            <input
              required
              type="email"
              maxLength={254}
              value={current.recipient}
              onChange={(e) =>
                setDraft({ ...current, recipient: e.target.value })
              }
            />
          </label>
          <p className="field-note">
            Recipient changes apply to future takeovers. Switching alerts off
            also stops queued alerts that have not been sent. Owner emails and
            weekly digests are unaffected.
          </p>
          <button className="button" type="submit">
            {busy ? "Saving…" : "Save notification settings"}
          </button>
          {draft && (
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setNotice("");
              }}
            >
              Discard changes
            </button>
          )}
        </fieldset>
      </form>
      <p role="status">{notice}</p>
    </section>
  );
}
