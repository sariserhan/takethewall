"use client";
import Image from "next/image";
import { useState } from "react";
import { siteUrl } from "@/lib/site-url";
export function OwnershipBadge({ publicId }: { publicId: string }) {
  const [format, setFormat] = useState<"markdown" | "html">("markdown");
  const [message, setMessage] = useState("");
  const path = `/takeover/${publicId}`;
  const href = new URL(`${path}?via=share`, siteUrl()).href;
  const src = new URL(`${path}/badge`, siteUrl()).href;
  const snippet =
    format === "markdown"
      ? `[![My Take The Wall placement](${src})](${href})`
      : `<a href="${href}"><img src="${src}" alt="My Take The Wall placement" width="400" height="64" /></a>`;
  return (
    <details className="ownership-badge">
      <summary>Embed my ownership badge</summary>
      <p>
        Add it to your website or GitHub README. It shows whether your placement
        is currently on the wall.
      </p>
      <Image
        src={`${path}/badge`}
        alt="Ownership badge preview"
        width={400}
        height={64}
        unoptimized
      />
      <label>
        Badge format
        <select
          value={format}
          onChange={(e) => {
            setFormat(e.target.value as "markdown" | "html");
            setMessage("");
          }}
        >
          <option value="markdown">Markdown · GitHub</option>
          <option value="html">HTML · Website</option>
        </select>
      </label>
      <label>
        Embed code
        <textarea
          aria-label="Embed code"
          readOnly
          value={snippet}
          rows={4}
          onFocus={(e) => e.target.select()}
        />
      </label>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(snippet);
            setMessage("Badge code copied.");
          } catch {
            setMessage("Select the embed code above and copy it manually.");
          }
        }}
      >
        Copy badge code
      </button>
      <p role="status">{message}</p>
      <small>
        Badge updates can take a minute. GitHub and other image caches may take
        longer. Click it to see the latest placement status.
      </small>
    </details>
  );
}
