"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
export function AdminCheckoutControls() {
  const state = useQuery(api.checkoutControls.state);
  const setPaused = useMutation(api.checkoutControls.setPaused);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="purchase-contact">
      <h2>Checkout availability</h2>
      <p>
        Pause new checkouts while keeping the current wall visible. Already-open
        Stripe sessions may still complete and publish.
      </p>
      <p>
        Paid-publication failure alerts use your takeover notification recipient
        and enabled setting below. Alerts are sent for live payments only.
      </p>
      <button
        disabled={!state || busy}
        onClick={async () => {
          if (!state) return;
          setBusy(true);
          setError("");
          try {
            await setPaused({ paused: !state.paused });
          } catch {
            setError("Could not change checkout availability. Please retry.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Saving…"
          : state?.paused
            ? "Resume new checkouts"
            : "Pause new checkouts"}
      </button>
      <p role="status">
        {state
          ? state.paused
            ? "New checkouts are paused."
            : "New checkouts are open."
          : "Loading checkout availability…"}
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
