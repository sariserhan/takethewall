"use client";
import { WallCanvas } from "./wall-canvas";
import Image from "next/image";
import { useState } from "react";
import { contentCta, detectLinkType } from "@/lib/content";
import { Arrow } from "./arrow";
export function TakeoverPreview({
  draft,
  editing = false,
  finalReview = false,
}: {
  editing?: boolean;
  finalReview?: boolean;
  draft: {
    displayName: string;
    description: string;
    websiteUrl: string;
    logoUrl: string;
    contentType: string;
    canvasDesign?: string;
    amaEnabled?: boolean;
    canvasImages?: import("@/lib/wall-design").DesignImage[];
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
        <span className="eyebrow">
          {finalReview ? "FINAL PREVIEW BEFORE PAYMENT" : "YOUR WALL PREVIEW"}
        </span>
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
      {finalReview && (
        <p className="preview-review-note">
          <strong>Live micro-AMA: {draft.amaEnabled ? "On" : "Off"}</strong>
          {draft.amaEnabled
            ? " — Visitors can ask questions during your reign. Answer from your owner dashboard."
            : " — You can enable it later in your owner dashboard."}
        </p>
      )}
      {finalReview && (
        <p className="preview-review-note">
          Switch between Desktop and Mobile to review your layout. Use Edit
          content below if anything needs adjusting.
        </p>
      )}
      <p className="preview-size">
        {device === "desktop"
          ? "Desktop · wide layout"
          : "Mobile · portrait layout"}
      </p>
      <div className={`preview-device ${device}`} data-preview-device={device}>
        <div className="preview-masthead">TAKE THE WALL</div>
        <div className="preview-context">THIS WALL BELONGS TO</div>
        {draft.canvasDesign ? (
          <WallCanvas
            design={draft.canvasDesign}
            images={[
              ...(draft.canvasImages ?? []).filter(
                (image) => image.key !== "logo",
              ),
              ...(draft.logoUrl ? [{ key: "logo", url: draft.logoUrl }] : []),
            ]}
            linksEnabled={false}
            device={device}
          />
        ) : (
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
        )}
        <div className="preview-bottom">ONE WALL. YOUR MOMENT.</div>
      </div>
      <p className="field-note">
        Approximate {device} layout.{" "}
        {draft.canvasDesign
          ? "Your chosen image cropping and block positions are shown. The live canvas adapts to the visitor’s screen."
          : "Images fit inside their space without cropping."}{" "}
        {editing
          ? "Saving updates your live content without starting a new takeover."
          : "Your number and start time are assigned after payment; this preview does not reserve the wall."}
      </p>
    </section>
  );
}
