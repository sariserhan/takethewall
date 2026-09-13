"use client";
/* eslint-disable @next/next/no-location-assign-relative-destination -- Reload homepage to reset mounted checkout state and consume the private confirmation token. */
import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Dialog } from "./dialog";
import type { CheckoutSession } from "./embedded-payment";
const EmbeddedPayment = dynamic(() => import("./embedded-payment"), {
  ssr: false,
});
export function ResumeCheckout() {
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState("ready");
  const [error, setError] = useState("");
  useEffect(() => {
    const saved = new URLSearchParams(location.hash.slice(1)).get("resume");
    if (!saved) return;
    try { sessionStorage.removeItem("ttw-confirmation"); } catch {}
    history.replaceState(null, "", location.pathname + location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Read the private browser fragment after hydration.
    setToken(saved);
  }, []);
  async function resume() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checkout/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", token }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(
          result.error ?? "Could not check this checkout. Please try again.",
        );
      if (result.state === "paid" || result.state === "processing") {
        location.assign("/?purchase=" + encodeURIComponent(result.token));
        return;
      }
      setState(result.state);
      if (result.state === "open") {
        setSession(result.session);
        setName(result.name);
        try {
          sessionStorage.setItem("ttw-confirmation", result.session.token);
        } catch {}
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resume checkout.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!token}
      onClose={() => {
        if (!busy) setToken(null);
      }}
      title="YOUR SAVED CHECKOUT."
      wide
    >
      {session ? (
        <>
          <p>
            Continue your saved takeover for <strong>{name}</strong>. Your
            original content is unchanged. Stripe shows the original checkout’s final total, including any applicable tax and currency conversion.
          </p>
          <EmbeddedPayment session={session} onClose={() => setToken(null)} />
        </>
      ) : (
        <>
          <p>
            {state === "expired"
              ? "This checkout has expired. No new payment was started. Create a new takeover to continue."
              : state === "unavailable"
                ? "This link is expired or unavailable. If you may have paid, recover your purchase before starting again."
                : "Continue on this device. We’ll check Stripe first and reopen your existing checkout only if it is still unpaid and open."}
          </p>
          {state === "ready" && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void resume()}
            >
              {busy ? "Checking payment…" : "Resume checkout"}
            </button>
          )}
          {state === "expired" && (
            <button
              className="button"
              onClick={() => {
                try {
                  sessionStorage.removeItem("ttw-draft");
                  sessionStorage.removeItem("ttw-confirmation");
                } catch {}
                location.assign("/?take=1");
              }}
            >
              Start a new takeover
            </button>
          )}
          {state === "unavailable" && (
            <Link href="/owner">Recover my purchase or checkout</Link>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </Dialog>
  );
}
