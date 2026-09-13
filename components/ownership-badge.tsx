"use client";
import Image from "next/image";
import { useState } from "react";
import { siteUrl } from "@/lib/site-url";
import { referralEmbeds } from "@/lib/referral-embeds";
export function OwnershipBadge({ publicId }: { publicId: string }) {
  const [format, setFormat] = useState<
      "banner" | "footer" | "markdown" | "html"
    >("banner"),
    [message, setMessage] = useState("");
  const embed = referralEmbeds(publicId, siteUrl()),
    snippet = embed.formats[format];
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage("Select the field and copy it manually.");
    }
  }
  return (
    <div>
      <section
        className="growth-share"
        aria-label="Social media referral sharing"
      >
        <h3>Share on social media</h3>
        <p>
          Use your referral link in a post, story link, profile bio, or message.
          Eligible visits count toward this takeover’s referrals.
        </p>
        <label>
          Your shareable referral link
          <input
            readOnly
            value={embed.href}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <div className="owner-share-actions">
          <button
            type="button"
            onClick={() => void copy(embed.href, "Referral link")}
          >
            Copy referral link
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                if (navigator.share)
                  await navigator.share({
                    title: "See my takeover on TakeTheWall",
                    url: embed.href,
                  });
                else await copy(embed.href, "Referral link");
              } catch {
                setMessage("Sharing cancelled. You can copy the link instead.");
              }
            }}
          >
            Share referral link ↗
          </button>
          <button
            type="button"
            onClick={() =>
              void copy(
                `See my takeover on TakeTheWall. Who’s next?\n\n${embed.href}`,
                "Social post",
              )
            }
          >
            Copy social post
          </button>
        </div>
        <p className="field-note">
          Share opens your device’s available apps. You can also copy the social
          post and paste it into X, LinkedIn, Facebook, or another app. For
          Instagram or TikTok, use the referral URL in a supported profile or
          story link.
        </p>
      </section>
      <details className="ownership-badge">
        <summary>Share your referral link · Website banner & footer</summary>
        <p>
          Share this link or add a banner or footer link to your website.
          Eligible visits through it contribute to your takeover’s referral
          count. Loading the banner alone does not count.
        </p>
        <label>
          Embed style
          <select
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as typeof format);
              setMessage("");
            }}
          >
            <option value="banner">Website banner · HTML</option>
            <option value="footer">Footer link · HTML</option>
            <option value="html">Compact ownership badge · HTML</option>
            <option value="markdown">GitHub README · Markdown</option>
          </select>
        </label>
        <div
          className={`referral-embed-preview ${format === "banner" ? "banner" : ""}`}
          aria-label="Referral embed preview"
        >
          {format === "footer" ? (
            <a
              className="referral-footer-preview"
              href={embed.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              See my takeover on TakeTheWall ↗
            </a>
          ) : (
            <a href={embed.href} target="_blank" rel="noopener noreferrer">
              <Image
                src={`/takeover/${encodeURIComponent(publicId)}/badge`}
                alt="See my TakeTheWall placement"
                width={400}
                height={64}
                unoptimized
              />
            </a>
          )}
        </div>
        <label>
          Embed code
          <textarea
            aria-label="Embed code"
            readOnly
            value={snippet}
            rows={5}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <button type="button" onClick={() => void copy(snippet, "Embed code")}>
          Copy embed code
        </button>

        <p className="field-note">
          Paste HTML into your website’s custom HTML block or footer. For
          GitHub, paste Markdown into your README. These embeds use no
          JavaScript.
        </p>
        <small>
          The badge shows whether your placement is live. Image caches may delay
          status updates. Referral counting requires a visible visit and
          automated checks; repeat visits and identifiable self-visits do not
          earn extra credit.
        </small>
      </details>
      <p role="status">{message}</p>
    </div>
  );
}
