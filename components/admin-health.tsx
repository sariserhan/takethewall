"use client";
import { useCallback, useEffect, useState } from "react";
type Health = {
  checkedAt: number;
  wallInitialized: boolean;
  lastPaymentAt: number | null;
  emailMissing: string[];
  failedMail: number;
  failedJobs: number;
  countsCappedAt: number;
  analyticsMissing: string[];
  metricsEnabled: boolean;
  environment: string;
  analyticsError: boolean;
  analyticsLastSuccessAt: number | null;
  rewardsEnabled: boolean;
  payoutsEnabled: boolean;
  promotionEnabled: boolean;
  claimSecretConfigured: boolean;
  rulesVersion: string;
  web: {
    missing: string[];
    stripeMode: string;
    stripeKeysMatchMode: boolean;
    metricsEnabled: boolean;
  };
};
const timestamp = (n: number | null) =>
  n
    ? new Date(n).toISOString().replace("T", " ").slice(0, 19) + " UTC"
    : "None recorded";
export function AdminHealth() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/health", { cache: "no-store" });
      if (!response.ok)
        throw new Error(
          "Health check unavailable. Retry after signing in; if it persists, check Convex logs.",
        );
      setData(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Health check failed");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch authenticated diagnostics when the overview mounts.
    void refresh();
  }, [refresh]);
  return (
    <section className="admin-health" aria-labelledby="health-title">
      <h2 id="health-title">System health</h2>
      <p>
        Configuration and recorded activity. These checks do not make payments,
        send emails, or prove provider delivery.
      </p>
      <button onClick={() => void refresh()} disabled={busy}>
        {busy ? "Checking…" : "Refresh health"}
      </button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            Last checked: {timestamp(data.checkedAt)}
            {error ? " · Results may be stale" : ""}
          </p>
          {!data.wallInitialized && (
            <p role="alert">
              Wall not initialized. Publish an uncounted house placement before
              testing checkout and visitor tracking.
            </p>
          )}
          <div className="admin-health-grid">
            <article>
              <h3>Payments</h3>
              <p>
                Stripe mode: <strong>{data.web.stripeMode}</strong> · Keys{" "}
                {data.web.stripeKeysMatchMode
                  ? "match mode"
                  : "missing or mismatched"}
                .
              </p>
              <p>
                Last accepted payment event: {timestamp(data.lastPaymentAt)}.
              </p>
              {data.web.missing.length > 0 && (
                <p>
                  Set these Vercel variables and redeploy:{" "}
                  {data.web.missing.join(", ")}.
                </p>
              )}
              <p>
                If payment completes without activation, inspect Stripe delivery
                to <code>/api/webhook</code> and its signing secret.
              </p>
            </article>
            <article>
              <h3>Email & delivery jobs</h3>
              <p>
                {data.emailMissing.length
                  ? `Set in Convex: ${data.emailMissing.join(", ")}.`
                  : "Convex sending credentials configured."}
              </p>
              <p>
                Failed transactional emails: {data.failedMail}. Failed delivery
                jobs (email or analytics): {data.failedJobs}. Counts capped at{" "}
                {data.countsCappedAt} each.
              </p>
              <p>
                Check Resend’s delivery log, verified sender and{" "}
                <code>/api/webhooks/resend</code>. Provider acceptance alone
                does not prove inbox delivery.
              </p>
            </article>
            <article>
              <h3>Analytics</h3>
              <p>
                Convex tracking: {data.metricsEnabled ? "enabled" : "disabled"}.
                Vercel production tracking:{" "}
                {data.web.metricsEnabled ? "enabled" : "disabled"}. Backend
                environment: {data.environment}.
              </p>
              {data.analyticsMissing.length > 0 && (
                <p>Set in Convex: {data.analyticsMissing.join(", ")}.</p>
              )}
              <p>
                Last VisitorPing report:{" "}
                {timestamp(data.analyticsLastSuccessAt)}.
              </p>
              {data.analyticsError && (
                <p>
                  VisitorPing’s latest refresh failed. Check the API key’s site
                  access and the backend logs.
                </p>
              )}
              <p>
                For live counting, set PUBLIC_METRICS_ENABLED=true and
                WALL_ENVIRONMENT=production in both environments. Preview
                traffic is excluded.
              </p>
            </article>
            <article>
              <h3>Rewards</h3>
              <p>
                Claims: {data.rewardsEnabled ? "enabled" : "disabled"} ·
                Payouts: {data.payoutsEnabled ? "enabled" : "disabled"} ·
                Promotion: {data.promotionEnabled ? "enabled" : "disabled"}.
              </p>
              <p>Rules version: {data.rulesVersion}.</p>
              {!data.claimSecretConfigured && (
                <p>Set CLAIM_TOKEN_SECRET in Convex before enabling claims.</p>
              )}
              <p>
                Manage switches in Settings. Claim and payout progress remains
                in Milestones and Claims; enabled switches alone do not prove
                processing is healthy.
              </p>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
