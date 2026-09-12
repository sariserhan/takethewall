"use client";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
type Email = {
  id: string;
  queue: "jobs" | "mail";
  kind: string;
  state: string;
  attempts: number;
  createdAt: number;
  nextAt: number;
  error: string | null;
  retryBefore: number;
};
type Activation = {
  id: string;
  name: string;
  createdAt: number;
  sessionId: string | null;
  environment: string;
  expired: boolean;
  blocked: boolean;
};
export function AdminDelivery() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);
  const raw = useQuery(api.deliveryAdmin.overview, {}),
    retry = useMutation(api.deliveryAdmin.retry);
  const [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const data = raw
    ? (JSON.parse(raw) as {
        emails: Email[];
        activations: Activation[];
        limit: number;
      })
    : null;
  async function perform(id: string, work: () => Promise<string>) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      setNotice(await work());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy("");
    }
  }
  if (!data) return <p role="status">Loading delivery queues…</p>;
  return (
    <section className="admin-delivery">
      <h2>Delivery & activation</h2>
      <p>
        Email status describes our delivery queue, not confirmed inbox delivery.
        Each queue shows up to {data.limit} records per state; pending
        activations show the latest {data.limit} drafts.
      </p>
      {error && <p role="alert">{error}</p>}
      <p role="status">{notice}</p>
      <h3>Email delivery</h3>
      {!data.emails.length && <p>No queued or failed emails.</p>}
      <div className="delivery-list">
        {data.emails.map((j) => (
          <article key={j.id}>
            <h4>{j.kind.replaceAll("_", " ")}</h4>
            <p>
              {j.state} · {j.attempts} attempts
            </p>
            <p>
              Queued{" "}
              {new Date(j.createdAt)
                .toISOString()
                .replace("T", " ")
                .slice(0, 19)}{" "}
              UTC
            </p>
            {j.error && <p>{j.error}</p>}
            {j.state === "failed" && now > 0 && now < j.retryBefore ? (
              <button
                disabled={!!busy}
                onClick={() =>
                  void perform(j.id, async () => {
                    await retry({ queue: j.queue, id: j.id });
                    return "Email queued for retry using its original delivery key.";
                  })
                }
              >
                Retry email
              </button>
            ) : j.state === "failed" ? (
              <p>
                Safe retry window expired. Check delivery in Resend before any
                manual send.
              </p>
            ) : (
              <p>Automatic delivery is scheduled.</p>
            )}
          </article>
        ))}
      </div>
      <h3>Pending activations</h3>
      <p>
        Check Stripe before retrying publication. An unpaid checkout is never
        activated. A recovered payment publishes now and can replace the current
        owner.
      </p>
      {!data.activations.length && <p>No pending activations.</p>}
      <div className="delivery-list">
        {data.activations.map((p) => (
          <article key={p.id}>
            <h4>{p.name}</h4>
            <p>
              {p.environment} ·{" "}
              {p.expired ? "Expired checkout" : "Awaiting payment confirmation"}
            </p>
            <p>{p.sessionId ?? "Checkout has not been created"}</p>
            {p.sessionId && !p.blocked && !p.expired && (
              <button
                disabled={!!busy}
                onClick={() =>
                  void perform(p.id, async () => {
                    const r = await fetch("/api/admin/recover", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ takeoverId: p.id }),
                    });
                    const result = await r.json();
                    if (!r.ok)
                      throw Error(result.error ?? "Could not check Stripe.");
                    return result.message;
                  })
                }
              >
                Check payment & publish if paid
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
