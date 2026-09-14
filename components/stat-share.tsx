"use client";
/* eslint-disable @next/next/no-img-element -- Locally generated QR code. */
import { useState } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "./dialog";
import { WallToolIcon } from "./wall-tool-icon";

export function StatShare({ publicId, name }: { publicId?: string; name?: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [creatingQr, setCreatingQr] = useState(false);
  const [message, setMessage] = useState("");
  const referral = publicId !== undefined;
  const label = referral ? "Share referral" : "Share wall";
  function show() {
    const target = new URL("/", window.location.origin);
    if (publicId) {
      target.searchParams.set("ref", publicId);
      target.searchParams.set("via", "share");
    }
    setUrl(target.href);
    setMessage("");
    setQr("");
    setOpen(true);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      setMessage("Copy the link below to share.");
    }
  }
  async function share() {
    setMessage("");
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: "Take The Wall", text: name ? `${name} is on the wall.` : "Take The Wall", url });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage("Sharing is unavailable. Copy the link below instead.");
    }
  }
  async function showQr() {
    setCreatingQr(true);
    setMessage("");
    try {
      const { toDataURL } = await import("qrcode");
      setQr(await toDataURL(url, { width: 320, margin: 4, errorCorrectionLevel: "M" }));
    } catch {
      setMessage("QR code unavailable. You can still copy the link below.");
    } finally {
      setCreatingQr(false);
    }
  }
  return <>
    <button type="button" className="stat-tool-button" aria-label={label} data-tooltip={label} aria-haspopup="dialog" onClick={show}>
      <WallToolIcon name="share" />{label}
    </button>
    {open && createPortal(<Dialog open onClose={() => setOpen(false)} title={label}>
      {referral && <p>This link credits eligible referral visits to {name || "the current owner"}’s takeover.</p>}
      <div className="stat-share-actions">
        <button type="button" onClick={() => void copy()}>Copy link</button>
        <button type="button" onClick={() => void share()}>Share</button>
        {referral && <button type="button" disabled={creatingQr} onClick={() => void showQr()}>{creatingQr ? "Creating QR…" : "QR code"}</button>}
      </div>
      {qr && <div className="stat-share-qr"><img src={qr} width="320" height="320" alt="QR code for this takeover’s referral link" /><p><a href={qr} download="take-the-wall-referral.png">Download QR code</a></p></div>}
      {message && <p role="status">{message}</p>}
      <label className="stat-share-link">{referral ? "Referral link" : "Wall link"}<input readOnly value={url} onFocus={event => event.currentTarget.select()} /></label>
    </Dialog>, document.body)}
  </>;
}
