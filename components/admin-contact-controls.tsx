"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
const date = (at: number | null) =>
  at
    ? new Date(at)
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, " UTC")
    : "Date not recorded";
const reasonLabel = (reason: string) =>
  ({
    hard_bounce: "Hard bounce",
    spam_complaint: "Spam complaint",
    admin_unsubscribe: "Unsubscribed by admin",
  })[reason] ?? reason;
type Subscription = {
  active: boolean;
  confirmedAt: number | null;
  unsubscribedAt: number | null;
};
export function AdminContactControls({ email }: { email: string }) {
  const raw = useQuery(api.contactManagement.details, { email }),
    unsubscribe = useMutation(api.contactManagement.unsubscribe),
    erase = useMutation(api.contactManagement.erase);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [deleting, setDeleting] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const data = raw
    ? (JSON.parse(raw) as {
        reason: string | null;
        stoppedAt: number | null;
        deletionState: string | null;
        deletedAt: number | null;
        wall: Subscription | null;
        milestone: Subscription | null;
      })
    : null;
  if (!data) return <p role="status">Loading contact controls…</p>;
  async function submit(kind: "unsubscribe" | "erase") {
    setBusy(true);
    setNotice("");
    try {
      if (kind === "erase") {
        await erase({ email, confirmation });
        setConfirmation("");
        setDeleting(false);
        setNotice(
          "Deletion requested. This contact has been removed from the directory; related email data is being cleared.",
        );
      } else {
        await unsubscribe({ email });
        setNotice(
          "Optional emails stopped, including wall updates, milestone alerts, and weekly owner digests.",
        );
      }
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Could not update this contact.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="email-history-item">
      <h3>Contact preferences</h3>
      {data.reason && (
        <p>
          <strong>Optional emails paused · {reasonLabel(data.reason)}</strong>
          <br />
          {date(data.stoppedAt)}
        </p>
      )}
      {(
        [
          ["Wall updates", data.wall],
          ["Milestone alerts", data.milestone],
        ] as const
      ).map(([label, s]) => (
        <p key={label}>
          {label}:{" "}
          {s ? (s.active ? "Confirmed" : "Inactive") : "Not subscribed"}
          {s && (
            <>
              <br />
              Confirmed: {date(s.confirmedAt)}
              {s.unsubscribedAt && (
                <>
                  <br />
                  Stopped: {date(s.unsubscribedAt)}
                </>
              )}
            </>
          )}
        </p>
      ))}
      {data.deletionState ? (
        <p role="status">
          {data.deletionState === "complete"
            ? "Contact email deletion complete."
            : "Contact email deletion in progress…"}
        </p>
      ) : (
        <>
          <button
            disabled={busy || !!data.reason}
            onClick={() => void submit("unsubscribe")}
          >
            Unsubscribe optional emails
          </button>
          <p>
            Purchase, support, and sign-in messages are separate from optional
            updates.
          </p>
          {!deleting ? (
            <button disabled={busy} onClick={() => setDeleting(true)}>
              Delete contact email data…
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit("erase");
              }}
            >
              <p>
                This permanently removes the address from the directory,
                subscriptions, email history, purchase contact fields, support
                correspondence, and reward contact fields. Private owner and
                claim links are revoked. Public wall content, payment records,
                reward eligibility records, administrator accounts, and copies
                already held by email providers remain.
              </p>
              <p>
                A hashed deletion marker prevents background indexing from
                recreating this contact. Already submitted emails cannot be
                recalled.
              </p>
              <label>
                Type {email} to confirm
                <input
                  autoComplete="off"
                  required
                  type="email"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
              <div className="owner-share-actions">
                <button
                  type="submit"
                  disabled={
                    busy ||
                    confirmation.trim().toLowerCase() !== email.toLowerCase()
                  }
                >
                  Delete contact email data permanently
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDeleting(false);
                    setConfirmation("");
                  }}
                >
                  Cancel deletion
                </button>
              </div>
            </form>
          )}
        </>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
