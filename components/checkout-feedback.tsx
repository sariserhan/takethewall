"use client";
import { useState } from "react";
import { Dialog } from "./dialog";
import { checkoutFeedbackReasons } from "@/lib/checkout-feedback";
export function CheckoutFeedback({
  open,
  stage,
  onClose,
}: {
  open: boolean;
  stage: "design" | "preview";
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title="BEFORE YOU GO…">
      {sent ? (
        <>
          <p role="status">Thanks — your feedback helps us improve the wall.</p>
          <button className="button" onClick={onClose}>
            Back to the wall
          </button>
        </>
      ) : (
        <form
          className="checkout-feedback"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setStatus("");
            const form = new FormData(e.currentTarget);
            try {
              const response = await fetch("/api/checkout/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...Object.fromEntries(form), stage }),
              });
              const body = await response.json();
              if (!response.ok)
                throw Error(
                  body.error || "Could not send feedback. Try again or skip.",
                );
              setSent(true);
            } catch (error) {
              setStatus(
                error instanceof Error
                  ? error.message
                  : "Could not send feedback. Try again or skip.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>What stopped you from taking the wall?</h3>
          <p>
            Optional and anonymous. Your draft stays in this tab; we only
            receive the answer you submit here.
          </p>
          <label>
            Choose a reason
            <select name="reason" required defaultValue="">
              <option value="" disabled>
                Select a reason
              </option>
              {checkoutFeedbackReasons.map((reason) => (
                <option key={reason}>{reason}</option>
              ))}
            </select>
          </label>
          <label>
            Anything else? (optional)
            <textarea
              name="details"
              maxLength={500}
              rows={3}
              placeholder="Please leave out personal or payment information."
            />
          </label>
          <div className="honeypot" aria-hidden="true">
            <input
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-label="Company"
            />
          </div>
          {status && <p role="alert">{status}</p>}
          <div className="review-actions">
            <button type="button" onClick={onClose}>
              Skip
            </button>
            <button className="button" disabled={busy}>
              {busy ? "Sending…" : "Send feedback"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
