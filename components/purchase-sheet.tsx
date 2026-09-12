"use client";
import { contentCta, validateWallContent } from "@/lib/content";
import Image from "next/image";
import dynamic from "next/dynamic";
import type { CheckoutSession } from "./embedded-payment";
const EmbeddedPayment = dynamic(() => import("./embedded-payment"), {
  ssr: false,
  loading: () => <p role="status">Loading secure payment…</p>,
});
import Link from "next/link";
import { Arrow } from "./arrow";
import { useEffect, useState } from "react";
import { Dialog } from "./dialog";
import { validateEmail, validateFile } from "@/lib/validation";
interface Draft {
  contentType: "link" | "personal";
  category: "website" | "app" | "social" | "personal";
  displayName: string;
  websiteUrl: string;
  description: string;
  buyerEmail: string;
  uploadKey: string;
  logoUrl: string;
  requestKey: string;
}
const empty: Draft = {
  contentType: "link",
  category: "website",
  displayName: "",
  websiteUrl: "",
  description: "",
  buyerEmail: "",
  uploadKey: "",
  logoUrl: "",
  requestKey: "",
};
export function PurchaseSheet({
  open,
  onClose,
  onCheckout,
}: {
  open: boolean;
  onClose: () => void;
  onCheckout: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(empty),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null);
  // Hydrate a browser-only saved draft after server rendering.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("ttw-draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          typeof parsed.websiteUrl === "string" &&
          typeof parsed.logoUrl === "string"
        )
          // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize browser storage or a verified network result after hydration.
          setDraft({ ...empty, ...parsed });
      }
    } catch {}
  }, []);
  function change(patch: Partial<Draft>) {
    setDraft((old) => {
      const next = { ...old, ...patch, requestKey: crypto.randomUUID() };
      try {
        sessionStorage.setItem("ttw-draft", JSON.stringify(next));
      } catch {}
      return next;
    });
    setError("");
  }
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      validateFile(file);
      const data = new FormData();
      data.set("logo", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: data,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not upload logo");
      change({ uploadKey: result.uploadKey, logoUrl: result.logoUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload logo");
    } finally {
      setUploading(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || uploading) return;
    setError("");
    try {
      validateWallContent(draft);
      validateEmail(draft.buyerEmail);
      setBusy(true);
      const requestKey = draft.requestKey || crypto.randomUUID();
      const saved = { ...draft, requestKey };
      setDraft(saved);
      try {
        sessionStorage.setItem("ttw-draft", JSON.stringify(saved));
      } catch {}
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saved),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Couldn't start checkout. Try again.");
      if (
        typeof data.clientSecret !== "string" ||
        typeof data.publishableKey !== "string" ||
        typeof data.token !== "string"
      )
        throw new Error("Checkout is unavailable. Please try again.");
      onCheckout();
      try {
        sessionStorage.setItem("ttw-confirmation", data.token);
      } catch {}
      setCheckout(data);
      setBusy(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't start checkout. Try again.",
      );
      setBusy(false);
    }
  }
  let domain = "your-website.com";
  try {
    domain = new URL(draft.websiteUrl).hostname.replace(/^www\./, "");
  } catch {}
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="MAKE IT YOURS."
      wide
    >
      {checkout ? (
        open && (
          <EmbeddedPayment
            session={checkout}
            onClose={(verified) => {
              if (verified) {
                setCheckout(null);
                setDraft(empty);
              }
              onClose();
            }}
          />
        )
      ) : (
        <>
          <p className="sheet-intro">
            One payment. Your ad goes live. Until someone else takes it.
          </p>
          <div className="purchase-grid">
            <form onSubmit={submit} className="purchase-form">
              <fieldset disabled={busy}>
                <legend>WHAT DO YOU WANT TO PUT ON THE WALL?</legend>
                <div className="content-choices">
                  {(["website", "app", "social", "personal"] as const).map(
                    (category) => (
                      <button
                        type="button"
                        aria-pressed={draft.category === category}
                        key={category}
                        onClick={() =>
                          change({
                            category,
                            contentType:
                              category === "personal" ? "personal" : "link",
                          })
                        }
                      >
                        {
                          {
                            website: "Website",
                            app: "App",
                            social: "Social",
                            personal: "Me / Message",
                          }[category]
                        }
                      </button>
                    ),
                  )}
                </div>
                <label>
                  Display name{" "}
                  {draft.contentType !== "personal" && (
                    <span className="field-hint">
                      Optional; defaults to the domain
                    </span>
                  )}
                  <input
                    maxLength={60}
                    required={draft.contentType === "personal"}
                    value={draft.displayName}
                    onChange={(e) => change({ displayName: e.target.value })}
                  />
                </label>
                {draft.contentType !== "personal" && (
                  <>
                    <label>
                      {draft.category === "app"
                        ? "App Store / Google Play URL"
                        : draft.category === "social"
                          ? "Profile/channel URL"
                          : "Website URL"}
                      <input
                        type="url"
                        autoComplete="url"
                        placeholder="https://your-website.com"
                        required
                        value={draft.websiteUrl}
                        onChange={(e) => change({ websiteUrl: e.target.value })}
                      />
                    </label>
                  </>
                )}
                <label>
                  {draft.category === "personal"
                    ? "Optional avatar/image"
                    : draft.category === "app"
                      ? "App icon"
                      : draft.category === "social"
                        ? "Image/avatar"
                        : "Logo"}{" "}
                  <span className="field-hint">
                    Optional · PNG, JPEG or WEBP · 2 MB max
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => void upload(e.target.files?.[0])}
                    disabled={uploading}
                  />
                </label>
                {uploading && (
                  <p role="status">Checking and uploading your logo…</p>
                )}
                <label>
                  {draft.contentType === "personal"
                    ? "Optional message"
                    : "Description"}{" "}
                  <span className="field-hint">
                    {[...draft.description].length}/120
                  </span>
                  <textarea
                    rows={3}
                    maxLength={120}
                    placeholder="Make your 120 characters count."
                    value={draft.description}
                    onChange={(e) => change({ description: e.target.value })}
                  />
                </label>
                <label>
                  Buyer email
                  <input
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    value={draft.buyerEmail}
                    onChange={(e) => change({ buyerEmail: e.target.value })}
                  />
                </label>
                <p className="field-note">
                  For your receipt, activation and replacement notices. Private.
                  No account. No marketing.
                </p>
              </fieldset>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button pay"
                disabled={busy || uploading}
                type="submit"
              >
                {busy ? "Preparing checkout…" : "PAY $3.99 & TAKE THE WALL"}
                <Arrow />
              </button>
              <p className="field-note">
                Checkout does not reserve a takeover number. By paying, you
                accept the <Link href="/terms">Terms</Link> and{" "}
                <Link href="/rewards">Reward Rules</Link>. No guaranteed
                duration, audience, impressions or clicks. No refunds for a
                short reign or low traffic.
              </p>
            </form>
            <aside className="preview">
              <span className="eyebrow">YOUR WALL PREVIEW</span>
              <div className="preview-ad">
                {draft.logoUrl ? (
                  <Image
                    src={draft.logoUrl}
                    width={140}
                    height={140}
                    alt="Your logo preview"
                    unoptimized
                  />
                ) : null}
                <h3>
                  {draft.displayName ||
                    (draft.contentType === "personal" ? "YOUR NAME" : domain)}
                </h3>
                <p>
                  {draft.description ||
                    "Your big moment. Your little corner of the internet."}
                </p>
                {draft.contentType !== "personal" && (
                  <span className="visit">
                    {contentCta()} <Arrow />
                  </span>
                )}
              </div>
              <div className="preview-footer">
                It could be yours for
                <br />
                <strong>1 second or 100 days.</strong>
              </div>
            </aside>
          </div>
        </>
      )}
    </Dialog>
  );
}
