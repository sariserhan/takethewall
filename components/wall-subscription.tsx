"use client";
import { useState } from "react";
import { Dialog } from "./dialog";
export function WallSubscription() {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <section className="milestone-alert-signup">
      <div>
        <h3>Wall changes</h3>
        <p>A new owner, a new story. Get each takeover or one daily update.</p>
      </div>
      <button onClick={() => setOpen(true)}>
        Notify me when the wall changes
      </button>
      <Dialog
        title="Follow the wall"
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
              const r = await fetch("/api/wall-subscriptions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "subscribe",
                  email: f.get("email"),
                  frequency: f.get("frequency"),
                  consent: f.get("consent") === "on",
                  honeypot: f.get("website"),
                }),
              });
              const result = await r.json();
              if (!r.ok) throw Error(result.error ?? "Please try again.");
              setNotice(
                "Check your inbox to confirm. Already subscribed? Use the preferences link in your last wall email to change frequency.",
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
              required
              type="email"
              name="email"
              autoComplete="email"
              maxLength={254}
            />
          </label>
          <label>
            Email frequency
            <select name="frequency" defaultValue="daily">
              <option value="daily">Daily summary · 09:00 UTC</option>
              <option value="every">Every takeover</option>
            </select>
          </label>
          <p>
            Daily summaries are sent only when the wall changes. Every-takeover
            alerts can mean several emails a day.
          </p>
          <label className="check-label">
            <input type="checkbox" name="consent" required />
            Send me wall-change emails. I can unsubscribe at any time.
          </label>
          <input
            aria-hidden="true"
            tabIndex={-1}
            name="website"
            autoComplete="off"
            className="alert-honeypot"
          />
          <p>
            This subscription is separate from milestone alerts and owner
            reports.
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
