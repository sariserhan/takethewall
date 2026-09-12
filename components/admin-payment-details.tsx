"use client";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
export function AdminPaymentDetails({
  takeoverId,
  sessionId,
  checkedAt,
}: {
  takeoverId: string;
  sessionId: string | null;
  checkedAt?: number | null;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const timeline = useQuery(
    api.deliveryAdmin.timeline,
    open ? { takeoverId: takeoverId as Id<"takeovers"> } : "skip",
  );
  return (
    <section className="admin-payment-details" aria-label="Payment details">
      {sessionId ? (
        <>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              setError("");
              setOpen(true);
              try {
                const response = await fetch("/api/admin/recover", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ takeoverId }),
                });
                const result = await response.json();
                if (!response.ok)
                  throw Error(
                    result.error ??
                      "Could not check Stripe. No payment status was inferred.",
                  );
                setMessage(result.message);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Stripe check failed.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Checking Stripe…" : "Check Stripe status"}
          </button>
          <p className="field-note">
            Checks the original checkout. A verified paid, eligible pending
            purchase will publish and may replace the current owner. Unpaid
            checkouts are never published.
          </p>
          <a
            href={`https://dashboard.stripe.com/${sessionId.startsWith("cs_test_") ? "test/" : ""}search?query=${encodeURIComponent(sessionId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Stripe checkout ↗
          </a>
        </>
      ) : (
        <p>No Stripe checkout is attached.</p>
      )}
      {checkedAt && (
        <p>
          Last Stripe check:{" "}
          <time dateTime={new Date(checkedAt).toISOString()}>
            {new Date(checkedAt).toISOString().replace("T", " ").slice(0, 19)}{" "}
            UTC
          </time>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide checkout timeline" : "Show checkout timeline"}
      </button>
      {open && (
        <div>
          <h4>Checkout activity</h4>
          {!timeline ? (
            <p role="status">Loading checkout timeline…</p>
          ) : (
            <>
              <ol className="checkout-timeline">
                {timeline.events.map((event, i) => (
                  <li key={`${event.at}-${i}`}>
                    <time dateTime={new Date(event.at).toISOString()}>
                      {new Date(event.at)
                        .toISOString()
                        .replace("T", " ")
                        .slice(0, 19)}{" "}
                      UTC
                    </time>
                    <span>{event.label}</span>
                  </li>
                ))}
              </ol>
              {timeline.notes.map((note, i) => (
                <p className="field-note" key={i}>
                  {note}
                </p>
              ))}
              <p className="field-note">
                Recorded events only. Resend acceptance does not guarantee inbox
                delivery.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
