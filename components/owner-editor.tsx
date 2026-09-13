"use client";
import { MorseMessageField } from "./morse-message-field";
import { useState } from "react";
import type { OwnerDashboard } from "@/lib/owner-types";
import { validateWallContent } from "@/lib/content";
import { ImageUpload } from "./image-upload";
import { Dialog } from "./dialog";
import { TakeoverPreview } from "./takeover-preview";

export function OwnerEditor({
  data,
  onSaved,
}: {
  data: OwnerDashboard;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [imagePending, setImagePending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState({
    contentType: "link",
    displayName: "",
    websiteUrl: "",
    description: "",
    morseMessage: "",
    logoUrl: "",
    uploadKey: "",
    removeImage: false,
  });
  function begin() {
    setDraft({
      contentType: data.owner.contentType,
      displayName: data.owner.displayName,
      websiteUrl: data.owner.websiteUrl,
      description: data.owner.description,
      morseMessage: data.owner.morseMessage ?? "",
      logoUrl: data.owner.logoUrl ?? "",
      uploadKey: "",
      removeImage: false,
    });
    setImagePending(false);
    setRevision(data.contentRevision ?? 0);
    setReview(false);
    setError("");
    setOpen(true);
  }
  function field(key: string, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    setReview(false);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || imagePending) return;
    setError("");
    try {
      validateWallContent(draft);
      if (!review) {
        setReview(true);
        return;
      }
      setBusy(true);
      const response = await fetch("/api/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          expectedRevision: revision,
          contentType: draft.contentType,
          displayName: draft.displayName,
          websiteUrl: draft.websiteUrl,
          description: draft.description,
          morseMessage: draft.morseMessage,
          uploadKey: draft.uploadKey,
          removeImage: draft.removeImage,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ??
            "Could not save. Refresh your dashboard and try again.",
        );
      setOpen(false);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your changes.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {data.active ? (
        <button className="button" onClick={begin}>
          Edit your content
        </button>
      ) : (
        <p className="field-note">
          Editing is closed because this takeover is no longer live.
        </p>
      )}
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Edit your content"
        wide
      >
        <p>
          Fix your name, message, image, or link while you own the wall. No
          extra payment. Your number, start time, stats, and prize progress stay
          the same.
        </p>
        <p className="field-note">
          Permanent milestone pages keep the original winning content. Changes
          are recorded for admin review.
        </p>
        <form className="owner-edit-form" onSubmit={submit}>
          {!review && (
            <fieldset disabled={busy}>
              <label>
                Content type
                <select
                  value={draft.contentType}
                  onChange={(e) => field("contentType", e.target.value)}
                >
                  <option value="link">Website, app, or social profile</option>
                  <option value="personal">Personal message</option>
                </select>
              </label>
              <label>
                Display name
                <input
                  required
                  maxLength={60}
                  value={draft.displayName}
                  onChange={(e) => field("displayName", e.target.value)}
                />
              </label>
              {draft.contentType === "link" && (
                <label>
                  Destination URL
                  <input
                    type="url"
                    required
                    maxLength={2048}
                    value={draft.websiteUrl}
                    placeholder="https://"
                    onChange={(e) => field("websiteUrl", e.target.value)}
                  />
                </label>
              )}
              <label>
                Description or message
                <textarea
                  maxLength={120}
                  value={draft.description}
                  onChange={(e) => field("description", e.target.value)}
                />
              </label>
              <MorseMessageField value={draft.morseMessage} fallback={draft.description || draft.displayName} onChange={(value) => field("morseMessage", value)} />
              <ImageUpload
                key={String(open)}
                label="Replace image"
                disabled={busy}
                onPending={setImagePending}
                onUploaded={(result) => {
                  setDraft((d) => ({ ...d, ...result, removeImage: false }));
                  setReview(false);
                }}
              />
              {draft.logoUrl && (
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      logoUrl: "",
                      uploadKey: "",
                      removeImage: true,
                    }))
                  }
                >
                  Remove image
                </button>
              )}
            </fieldset>
          )}
          <TakeoverPreview draft={draft} editing />
          {!data.active && (
            <p role="alert">
              Your takeover has ended. These changes cannot be published.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="owner-share-actions">
            {review && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setReview(false)}
              >
                Back to editing
              </button>
            )}
            <button
              type="submit"
              className="button"
              disabled={busy || imagePending || !data.active}
            >
              {busy
                ? "Saving…"
                : review
                  ? "Save changes to the wall"
                  : "Preview changes"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
