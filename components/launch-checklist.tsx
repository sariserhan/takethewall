"use client";
import { useState } from "react";
import { referralEmbeds } from "@/lib/referral-embeds";
import { siteUrl } from "@/lib/site-url";
export function LaunchChecklist({ publicId }: { publicId: string }) {
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [installed, setInstalled] = useState(false);
  const embed = referralEmbeds(publicId, siteUrl());
  const tweet =
    "https://twitter.com/intent/tweet?" +
    new URLSearchParams({
      text: "I just took the wall! Who’s next?",
      url: embed.href,
    });
  async function copy(text: string, link = false) {
    try {
      await navigator.clipboard.writeText(text);
      if (link) setCopied(true);
      setMessage(
        link
          ? "Referral link copied."
          : "Banner code copied. Paste it into your website’s HTML block.",
      );
    } catch {
      setMessage(
        "Clipboard unavailable. Select the link or code below to copy manually.",
      );
    }
  }
  return (
    <section className="launch-checklist" aria-label="Launch checklist">
      <span className="eyebrow">YOUR NEXT THREE STEPS</span>
      <h3>Give your wall a launch.</h3>
      <p>
        Share your referral link to bring visitors. Eligible verified referrals
        can qualify for Reward B under the Reward Rules.
      </p>
      <ol>
        <li>
          <strong>1. Copy your referral link</strong>
          <input
            aria-label="Launch referral link"
            readOnly
            value={embed.href}
            onFocus={(e) => e.target.select()}
          />
          <button type="button" onClick={() => void copy(embed.href, true)}>
            {copied ? "Copied — copy again" : "Copy my referral link"}
          </button>
        </li>
        <li>
          <strong>2. Tell your audience</strong>
          <a
            className="button"
            href={tweet}
            target="_blank"
            rel="noopener noreferrer"
          >
            Post to X ↗
          </a>
          <p>
            Or paste your link into your favorite social app. Review your post
            before publishing.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
            />
            <span className="check-copy">I shared my post</span>
          </label>
        </li>
        <li>
          <strong>3. Add a website banner (optional)</strong>
          <details>
            <summary>Get banner code</summary>
            <textarea
              aria-label="Launch banner code"
              readOnly
              rows={4}
              value={embed.formats.banner}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={() => void copy(embed.formats.banner)}
            >
              Copy banner code
            </button>
            <p>
              Paste into a custom HTML block on your website. For footer and
              GitHub formats, use the sharing tools below.
            </p>
          </details>
          <label className="check-label">
            <input
              type="checkbox"
              checked={installed}
              onChange={(e) => setInstalled(e.target.checked)}
            />
            <span className="check-copy">I added my banner</span>
          </label>
        </li>
      </ol>
      <p role="status">{message}</p>
      <small>
        Checklist marks are for this visit. Your links and sharing tools remain
        in your owner dashboard.
      </small>
    </section>
  );
}
