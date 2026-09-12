"use client";
import Image from "next/image";
import { useState } from "react";
import { contentCta, detectLinkType } from "@/lib/content";
import { Arrow } from "./arrow";
export function TakeoverPreview({
  draft,
  editing = false,
}: {
  editing?: boolean;
  draft: {
    displayName: string;
    description: string;
    websiteUrl: string;
    logoUrl: string;
    contentType: string;
  };
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  let domain = "YOUR NAME";
  let linkType = "website";
  try {
    domain = new URL(draft.websiteUrl).hostname.replace(/^www\./, "");
    linkType = detectLinkType(draft.websiteUrl);
  } catch {}
  return (
    <section className="takeover-preview" aria-label="Takeover preview">
      <div className="preview-toolbar">
        <span className="eyebrow">YOUR WALL PREVIEW</span>
        <div aria-label="Preview device">
          {(["desktop", "mobile"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={device === mode}
              onClick={() => setDevice(mode)}
            >
              {mode === "desktop" ? "Desktop" : "Mobile"}
            </button>
          ))}
        </div>
      </div>
      <p className="preview-size">
        {device === "desktop"
          ? "Desktop · wide layout"
          : "Mobile · portrait layout"}
      </p>
      <div className={`preview-device ${device}`} data-preview-device={device}>
        <div className="preview-masthead">TAKE THE WALL</div>
        <div className="preview-context">THIS WALL BELONGS TO</div>
        <div className="preview-creative">
          {draft.logoUrl && (
            <Image
              src={draft.logoUrl}
              alt="Your image"
              width={140}
              height={140}
              unoptimized
            />
          )}
          <h3>{draft.displayName || domain}</h3>
          {draft.description && <p>{draft.description}</p>}
          {draft.contentType !== "personal" && (
            <span className="visit">
              {contentCta(linkType)} <Arrow />
            </span>
          )}
        </div>
        <div className="preview-bottom">ONE WALL. YOUR MOMENT.</div>
      </div>
      <p className="field-note">
        {editing
          ? `Approximate ${device} layout. Images fit inside their space without cropping. Saving updates your live content without starting a new takeover.`
          : `Approximate ${device} layout. Images fit inside their space without cropping. Your number and start time are assigned after payment; this preview does not reserve the wall.`}
      </p>
    </section>
  );
}
