"use client";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import Link from "next/link";
import { TakeoverShare } from "./takeover-share";
import { loadStripe } from "@stripe/stripe-js/pure";
import { useEffect, useMemo, useState } from "react";
export interface CheckoutSession {
  clientSecret: string;
  publishableKey: string;
  token: string;
}
export default function EmbeddedPayment({
  session,
  onClose,
}: {
  session: CheckoutSession;
  onClose: (verified: boolean) => void;
}) {
  const [complete, setComplete] = useState(false);
  const [status, setStatus] = useState("pending");
  const [publicId, setPublicId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const stripe = useMemo(
    () =>
      loadStripe(session.publishableKey).catch(() => {
        setError(
          "The payment form could not load. Check your connection and reopen checkout.",
        );
        return null;
      }),
    [session.publishableKey],
  );
  const options = useMemo(
    () => ({
      clientSecret: session.clientSecret,
      onComplete: () => setComplete(true),
    }),
    [session.clientSecret],
  );
  useEffect(() => {
    if (!complete) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    async function check() {
      try {
        const response = await fetch("/api/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: session.token }),
        });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (stopped) return;
        setStatus(result.state);
        setError("");
        if (["expired", "invalid"].includes(result.state)) return;
        if (["active", "replaced"].includes(result.state)) {
          if (typeof result.publicId === "string") setPublicId(result.publicId);
          try {
            sessionStorage.removeItem("ttw-draft");
            sessionStorage.removeItem("ttw-confirmation");
          } catch {}
          return;
        }
      } catch {
        if (stopped) return;
      }
      if (++tries < 15) timer = setTimeout(check, 4000);
      else
        setError(
          "Payment confirmation is still processing. Check again shortly; do not pay again.",
        );
    }
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [complete, session.token, attempt]);
  return (
    <section className="embedded-payment" aria-label="Secure payment">
      {complete ? (
        <div role="status">
          <h3>
            {status === "active"
              ? "Your wall is live."
              : status === "replaced"
                ? "Your takeover was activated."
                : ["expired", "invalid"].includes(status)
                  ? "We couldn’t confirm this takeover."
                  : "Checkout complete. Verifying payment…"}
          </h3>
          <p>
            {status === "replaced"
              ? "Another takeover has already replaced yours."
              : status === "active"
                ? "Payment verified. Your placement is published."
                : ["expired", "invalid"].includes(status)
                  ? "Check your receipt and contact support before trying another payment."
                  : "We’re waiting for verified payment confirmation before publishing your wall. Please don’t pay again."}
          </p>
          {(error || ["expired", "invalid"].includes(status)) && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setAttempt((x) => x + 1);
              }}
            >
              Check payment status
            </button>
          )}
          {publicId && <TakeoverShare publicId={publicId} />}
          <Link href="/?info=support">Need help? Contact support</Link>
          <button
            type="button"
            onClick={() =>
              onClose(status === "active" || status === "replaced")
            }
          >
            Back to the wall
          </button>
        </div>
      ) : (
        <EmbeddedCheckoutProvider stripe={stripe} options={options}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
