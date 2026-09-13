"use client";
import { useEffect, useRef, useState } from "react";
import { validateUrl } from "@/lib/validation";
export function TryMine({
  onClose,
  onPrepare,
}: {
  onClose: () => void;
  onPrepare: () => void;
}) {
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleInput.current?.focus({ preventScroll: true });
  }, []);
  const [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="try-mine owner-ad">
      <span className="eyebrow">PRIVATE PREVIEW · ONLY YOU SEE THIS</span>
      <h2>{title || "Your project belongs here."}</h2>
      <p>{url || "Give your next big thing its moment."}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const destination = validateUrl(url);
            sessionStorage.setItem(
              "ttw-draft",
              JSON.stringify({
                contentType: "link",
                category: "website",
                displayName: title.trim(),
                websiteUrl: destination.websiteUrl,
                description: "",
                logoUrl: "",
                uploadKey: "",
                buyerEmail: "",
                weeklyDigestEnabled: false,
                requestKey: crypto.randomUUID(),
              }),
            );
            onPrepare();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not prepare checkout.",
            );
          }
        }}
      >
        <label>
          Your title
          <input
            required
            ref={titleInput}
            maxLength={60}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My next big thing"
          />
        </label>
        <label>
          Your website
          <input
            required
            type="url"
            maxLength={2048}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-project.com"
          />
        </label>
        <div className="experiment-actions">
          <button type="submit">
            Continue to checkout · $4.99 + applicable tax
          </button>
          <button type="button" onClick={onClose}>
            Back to live wall
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        <small>
          Review your content and complete payment to publish. This preview does
          not reserve the wall.
        </small>
      </form>
    </div>
  );
}
