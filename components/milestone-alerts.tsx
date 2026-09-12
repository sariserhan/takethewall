"use client";
import { useState } from "react";
import { Dialog } from "./dialog";
export function MilestoneAlerts() {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <section className="milestone-alert-signup">
      <div>
        <h2>Keep an eye on the next milestone.</h2>
        <p>
          Get an email when a milestone is within 10 counted takeovers. No
          number is reserved.
        </p>
      </div>
      <button onClick={() => setOpen(true)}>Notify me about milestones</button>
      <Dialog
        title="Milestone alerts"
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setNotice("");
            try {
              const r = await fetch("/api/alerts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "subscribe",
                  email: f.get("email"),
                  consent: f.get("consent") === "on",
                  honeypot: f.get("website"),
                }),
              });
              const result = await r.json();
              if (!r.ok) throw Error(result.error ?? "Please try again.");
              setNotice(
                "Check your inbox to confirm. If you are already subscribed, no new confirmation is needed.",
              );
            } catch (e) {
              setNotice(e instanceof Error ? e.message : "Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email address
            <input
              type="email"
              name="email"
              required
              maxLength={254}
              autoComplete="email"
            />
          </label>
          <label className="check-label">
            <input type="checkbox" name="consent" required />
            Email me approaching milestone alerts. I can unsubscribe at any
            time.
          </label>
          <input
            aria-hidden="true"
            tabIndex={-1}
            name="website"
            autoComplete="off"
            className="alert-honeypot"
          />
          <p>
            Confirm your email before alerts begin. Alerts do not guarantee a
            takeover number or a prize. Check the live wall and Reward Rules
            before paying.
          </p>
          <button className="button" disabled={busy}>
            {busy ? "Submitting…" : "Send confirmation email"}
          </button>
          <p role="status">{notice}</p>
        </form>
      </Dialog>
    </section>
  );
}
