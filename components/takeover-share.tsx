"use client";
import Image from "next/image";
import { Arrow } from "./arrow";
import { Dialog } from "./dialog";
import { useState } from "react";
export function TakeoverShare({
  publicId,
  previousOwnerName,
  name = "My takeover",
  editorial = false,
  revision = 0,
}: {
  publicId: string;
  previousOwnerName?: string | null;
  name?: string;
  editorial?: boolean;
  revision?: number;
}) {
  const [format, setFormat] = useState("landscape"),
    [message, setMessage] = useState("");
  const path = `/takeover/${publicId}?via=share`;
  const caption = () =>
    `${editorial ? name + " took the wall." : "I took the wall!"}${previousOwnerName ? " I replaced " + previousOwnerName + "." : ""} One wall. One owner. $4.99 to take over until the next owner replaces you. ${new URL(path, window.location.origin).href}`;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied.");
    } catch {
      setMessage(
        "Copy is unavailable in this browser. Open the public page and copy its address.",
      );
    }
  };
  return (
    <section className="growth-share" aria-label="Share this takeover">
      <h2>{editorial ? "Social post kit" : "Share my takeover"}</h2>
      {previousOwnerName && (
        <p className="replacement-story">
          {editorial ? name + " replaced " : "You replaced "}
          <strong>{previousOwnerName}</strong>.
        </p>
      )}
      <Image
        src={`/takeover/${publicId}/card?format=${format}&v=${revision}`}
        alt={`Share card for ${name}`}
        width={format === "landscape" ? 1200 : 1080}
        height={format === "portrait" ? 1350 : format === "square" ? 1080 : 630}
        unoptimized
      />
      <label>
        Image format
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="landscape">Landscape · 1200 × 630</option>
          <option value="square">Square · 1080 × 1080</option>
          <option value="portrait">Portrait · 1080 × 1350</option>
        </select>
      </label>
      {editorial && (
        <p className="social-caption">
          {name} took the wall. One wall. One owner. $4.99 to take over until
          the next owner replaces you.{" "}
          <a href={path}>
            View this takeover <Arrow />
          </a>
        </p>
      )}
      <div className="owner-share-actions">
        <button
          className="button"
          onClick={async () => {
            try {
              if (navigator.share)
                await navigator.share({
                  title: name,
                  text: caption(),
                  url: new URL(path, window.location.origin).href,
                });
              else await copy(new URL(path, window.location.origin).href);
            } catch {
              setMessage(
                "Sharing cancelled or unavailable. You can copy the link instead.",
              );
            }
          }}
        >
          {editorial ? "Share post" : "Share my takeover"} <Arrow />
        </button>
        <button onClick={() => void copy(caption())}>Copy caption</button>
        <button
          onClick={() => void copy(new URL(path, window.location.origin).href)}
        >
          Copy link
        </button>
        <a
          href={`/takeover/${publicId}/card?format=${format}&download=1`}
          download
        >
          Download image
        </a>
        <a href={path}>
          Open public page <Arrow />
        </a>
      </div>
      <p role="status">{message}</p>
      {editorial && (
        <p className="field-note">
          Review the image and caption before posting. Nothing is published
          automatically.
        </p>
      )}
    </section>
  );
}

export function PublishedShare({
  publicId,
  previousOwnerName,
}: {
  publicId: string;
  previousOwnerName?: string | null;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>
        Share my takeover <Arrow />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="YOUR TAKEOVER IS PUBLISHED."
      >
        <TakeoverShare
          publicId={publicId}
          previousOwnerName={previousOwnerName}
        />
      </Dialog>
    </>
  );
}
