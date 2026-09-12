"use client";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { contentCta, validateWallContent } from "@/lib/content";

export function AdminPublish() {
  const wall = useQuery(api.wall.current);
  const publish = useMutation(api.admin.publish);
  const [type, setType] = useState<"link" | "personal">("link");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [counted, setCounted] = useState(false);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Parameters<typeof publish>[0] | null>(
    null,
  );
  return (
    <section className="admin-detail">
      <h2>Publish to the live wall</h2>
      <p>
        Current owner:{" "}
        {wall === undefined
          ? "Loading…"
          : (wall?.owner.displayName ?? "No owner yet")}
        .
      </p>
      <p>
        Publish a website, app, social profile or message without a Stripe
        payment. The next takeover can replace it.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage("");
          if (wall === undefined) return;
          if (!draft) {
            try {
              const content = validateWallContent({
                contentType: type,
                websiteUrl: url,
                displayName: name,
                description,
              });
              setDraft({
                ...content,
                countTowardMilestones: counted,
                recipientEmail: email,
                reason,
                requestKey: crypto.randomUUID(),
                expectedCurrentId: wall?.owner.id ?? null,
              });
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Check the placement.",
              );
            }
            return;
          }
          setBusy(true);
          try {
            await publish(draft);
            setDraft(null);
            setUrl("");
            setName("");
            setDescription("");
            setReason("");
            setEmail("");
            setCounted(false);
            setMessage("Published successfully. The live wall is updated.");
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Publishing failed. You can retry this request.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {!draft ? (
          <>
            <label>
              Placement type
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
              >
                <option value="link">Website / app / social profile</option>
                <option value="personal">Personal message</option>
              </select>
            </label>
            {type === "link" && (
              <label>
                Destination URL
                <input
                  required
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://instagram.com/yourprofile"
                />
              </label>
            )}
            <label>
              Display name
              <input
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Description / message
              <textarea
                maxLength={120}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={counted}
                onChange={(e) => setCounted(e.target.checked)}
              />
              Count toward milestones
            </label>
            <p>
              {counted
                ? "Assigns the next takeover number, joins the audit hash chain and can trigger a prize claim. Recorded as admin-issued with $0 collected."
                : "Replaces the wall without advancing takeover numbers, the audit hash chain or prizes."}
            </p>
            {counted && (
              <label>
                Recipient email for activation and prize claims
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            <label>
              Reason for publishing
              <textarea
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button disabled={wall === undefined}>Preview placement</button>
          </>
        ) : (
          <>
            <div className="preview">
              <p className="eyebrow">
                {draft.countTowardMilestones
                  ? "COUNTED ADMIN TAKEOVER · $0 COLLECTED"
                  : "ADMIN PLACEMENT · NOT COUNTED"}
              </p>
              <h3>{draft.displayName}</h3>
              <p>{draft.description}</p>
              {draft.contentType === "link" && (
                <p>
                  {contentCta(validateWallContent(draft).linkType)} ·{" "}
                  {draft.websiteUrl}
                </p>
              )}
            </div>
            <p>
              This replaces the current owner immediately.
              {draft.countTowardMilestones
                ? " It may open a milestone prize claim for the recipient."
                : ""}
            </p>
            <button disabled={busy}>
              {busy ? "Publishing…" : "Publish now — no payment"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Edit placement / refresh current owner
            </button>
          </>
        )}
        <p role="status">{message}</p>
      </form>
    </section>
  );
}
