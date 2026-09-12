"use client";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
export function AdminFunnel() {
  const [days, setDays] = useState(7);
  const now = new Date(),
    to = now.toISOString().slice(0, 10),
    from = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - days + 1,
      ),
    )
      .toISOString()
      .slice(0, 10);
  const report = useQuery(api.funnel.report, { from, to });
  return (
    <section className="admin-funnel">
      <h2>Measured activity funnel</h2>
      <div className="owner-share-actions">
        {[7, 30].map((n) => (
          <button key={n} aria-pressed={n === days} onClick={() => setDays(n)}>
            Last {n} days
          </button>
        ))}
      </div>
      <p>
        {from} to {to} · UTC
      </p>
      {report ? (
        <>
          <div className="funnel-stages">
            {[
              { label: "Wall visits", value: report.visits },
              { label: "Checkouts created", value: report.checkoutStarts },
              { label: "Paid activations", value: report.paidActivations },
            ].map((s) => (
              <article key={s.label}>
                <h3>{s.label}</h3>
                <strong>{s.value.toLocaleString("en-US")}</strong>
              </article>
            ))}
          </div>
          <p>
            Checkout / visit ratio:{" "}
            {report.visits
              ? ((report.checkoutStarts / report.visits) * 100).toFixed(1) + "%"
              : "—"}{" "}
            · Activation / checkout ratio:{" "}
            {report.checkoutStarts
              ? (
                  (report.paidActivations / report.checkoutStarts) *
                  100
                ).toFixed(1) + "%"
              : "—"}
          </p>
          <p className="field-note">
            {report.startedAt
              ? `First tracked activity in this window: ${new Date(report.startedAt).toISOString().replace("T", " ").slice(0, 19)} UTC.`
              : "No funnel activity recorded yet."}{" "}
            Visits count measured page loads once, even if the owner changes.
            Checkouts count Stripe sessions once; activations count confirmed
            payments. Demo additions, starting offsets, test payments, and admin
            publications are excluded.
          </p>
          <p className="field-note">
            These are activity totals in the selected period, not a matched
            group of visitors. Tracking gaps and payments for earlier checkouts
            can affect the ratios; they are not exact abandonment rates. Earlier
            history is not backfilled.
          </p>
        </>
      ) : (
        <p role="status">Loading funnel…</p>
      )}
    </section>
  );
}
