"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { OwnerDashboard } from "@/lib/owner-types";
import { ctr, duration } from "@/lib/validation";
import { OwnerEditor } from "./owner-editor";
import { StatHelp } from "./stat-help";
export function OwnerDashboardView() {
  const router = useRouter();
  const [data, setData] = useState<OwnerDashboard | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [number, setNumber] = useState(""),
    [notice, setNotice] = useState("");
  const [cardFormat, setCardFormat] = useState("landscape");
  const [now, setNow] = useState<number | null>(null);
  async function refresh() {
    const response = await fetch("/api/owner", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw Error(result.error ?? "Dashboard unavailable.");
    setData(result.dashboard);
    setNow(Date.now());
  }
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get("token");
    if (token) history.replaceState(null, "", location.pathname);
    (async () => {
      try {
        if (token) {
          const response = await fetch("/api/owner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "login", token }),
          });
          const result = await response.json();
          if (!response.ok)
            throw Error(result.error ?? "Invalid private link.");
          if (alive) {
            setData(result.dashboard);
            setNow(Date.now());
          }
        } else if (alive) await refresh();
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "Dashboard unavailable.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [data]);
  useEffect(() => {
    if (!data?.active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh().catch(() =>
          setError("Live refresh unavailable. Try Refresh stats."),
        );
    }, 30_000);
    return () => clearInterval(timer);
  }, [data?.active]);
  async function request(action: string, extra: Record<string, unknown> = {}) {
    const response = await fetch("/api/owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error ?? "Please try again.");
    return result;
  }
  async function share() {
    if (!data) return;
    const title = `I took Take The Wall${data.owner.takeoverNumber ? ` — #${data.owner.takeoverNumber}` : ""}`;
    try {
      if (navigator.share)
        await navigator.share({ title, text: title, url: data.shareUrl });
      else {
        await navigator.clipboard.writeText(data.shareUrl);
        setNotice("Public share link copied.");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError("Could not share. Copy the public link below.");
    }
  }
  if (loading)
    return (
      <section className="owner-loading" aria-busy="true">
        <h1>Opening your dashboard…</h1>
        <div className="skeleton-creative" />
      </section>
    );
  if (!data)
    return (
      <section className="owner-access-form">
        <p className="eyebrow">YOUR WALL. YOUR RESULTS.</p>
        <h1>
          OPEN YOUR
          <br />
          OWNER DASHBOARD.
        </h1>
        <p>
          Use the private link in your activation email, or request it again
          below. Paid and closed the browser? Leave the number blank to recover
          your latest purchases. No account needed.
        </p>
        {error && <p role="alert">{error}</p>}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request(number ? "request" : "recover", {
                email,
                ...(number ? { number: Number(number) } : {}),
              });
              setNotice(
                "If we find a completed purchase, we’ll email a private link. Pending payments are checked with Stripe. Check your inbox and spam folder; no need to pay again.",
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "Request failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Takeover number (optional)
            <input
              inputMode="numeric"
              type="number"
              min={1}
              step={1}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </label>
          <label>
            Checkout or receipt email
            <input
              type="email"
              maxLength={254}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="button" disabled={busy}>
            {busy ? "Sending…" : "Email my private link"}
          </button>
        </form>
        <p role="status">{notice}</p>
      </section>
    );
  const owner = data.owner;
  const reign = duration(
    (data.replacedAt ?? now ?? owner.activatedAt) - owner.activatedAt,
  );
  return (
    <>
      <div className="owner-dashboard-toolbar">
        <span className={data.active ? "owner-state live" : "owner-state"}>
          {data.active ? "LIVE ON THE WALL" : "REIGN ENDED"}
        </span>
        <button
          onClick={async () => {
            await request("logout");
            setData(null);
            setNotice("Signed out.");
          }}
        >
          Sign out
        </button>
      </div>
      <section className="owner-dashboard-intro">
        <p className="eyebrow">
          YOUR TAKEOVER {owner.takeoverNumber ? `#${owner.takeoverNumber}` : ""}
        </p>
        <h1>{owner.displayName || owner.domain}</h1>
        <p>
          {data.active
            ? "Your content is on the wall. Here is how your reign is doing."
            : "Your time on the wall is part of its history. Here are your recorded results."}
        </p>
        <p className="field-note">
          Measured stats only. Public demo additions are excluded.
        </p>
      </section>
      {error && <p role="alert">{error}</p>}
      <section className="owner-stats" aria-label="Your takeover analytics">
        {[
          ["CURRENT REIGN", reign],
          ["IMPRESSIONS", owner.impressions.toLocaleString("en-US")],
          ["UNIQUE VISITORS", owner.uniqueVisitors.toLocaleString("en-US")],
          ["CLICKS", owner.clicks.toLocaleString("en-US")],
          ["CTR", `${ctr(owner.impressions, owner.clicks).toFixed(2)}%`],
        ].map(([label, value]) => (
          <article key={label}>
            <StatHelp label={label} />
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <div className="owner-dashboard-grid">
        <section className="owner-content-card">
          <h2>Your placement</h2>
          {owner.logoUrl && (
            <Image
              src={owner.logoUrl}
              alt={owner.displayName}
              width={120}
              height={120}
              unoptimized
            />
          )}
          <OwnerEditor
            data={data}
            onSaved={async () => {
              await refresh();
              setNotice(
                "Your content has been updated. Your takeover and stats are unchanged.",
              );
              setError("");
            }}
          />
          {!data.active && (
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await request("repeat");
                  const d = result.draft;
                  const category =
                    d.contentType === "personal" ? "personal" : "website";
                  sessionStorage.setItem(
                    "ttw-draft",
                    JSON.stringify({
                      ...d,
                      category,
                      requestKey: crypto.randomUUID(),
                    }),
                  );
                  router.push("/?take=1");
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not prepare your draft.",
                  );
                  setBusy(false);
                }
              }}
            >
              Take the wall again — $3.99
            </button>
          )}
          <h3>{owner.displayName}</h3>
          <p>{owner.description}</p>
          <p>
            Started{" "}
            <time>
              {new Date(owner.activatedAt)
                .toISOString()
                .replace("T", " ")
                .slice(0, 19)}{" "}
              UTC
            </time>
          </p>
          {data.replacedAt && (
            <p>
              Ended{" "}
              {new Date(data.replacedAt)
                .toISOString()
                .replace("T", " ")
                .slice(0, 19)}{" "}
              UTC
            </p>
          )}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await refresh();
                setNotice("Stats refreshed.");
                setError("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Refresh failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Refresh stats
          </button>
        </section>
        <section className="owner-share-card">
          <h2>Share your moment.</h2>
          <p>
            Show people your takeover. This public link never contains your
            dashboard access key.
          </p>
          <label>
            Share card format
            <select
              value={cardFormat}
              onChange={(e) => setCardFormat(e.target.value)}
            >
              <option value="landscape">Landscape · 1200 × 630</option>
              <option value="square">Square · 1080 × 1080</option>
              <option value="portrait">Portrait · 1080 × 1350</option>
            </select>
          </label>
          <Image
            src={`/takeover/${data.publicId}/card?format=${cardFormat}&v=${data.contentRevision ?? 0}`}
            alt={`Share card for takeover ${owner.takeoverNumber}`}
            width={cardFormat === "landscape" ? 1200 : 1080}
            height={
              cardFormat === "landscape"
                ? 630
                : cardFormat === "square"
                  ? 1080
                  : 1350
            }
            unoptimized
          />
          <div className="owner-share-actions">
            <button className="button" onClick={() => void share()}>
              Share takeover ↗
            </button>
            <a
              href={`/takeover/${data.publicId}/card?download=1&format=${cardFormat}`}
              download
            >
              Download card
            </a>
          </div>
          <label>
            Public share link
            <input
              readOnly
              value={data.shareUrl}
              onFocus={(e) => e.target.select()}
            />
          </label>
        </section>
        <section className="owner-preferences">
          <h2>Email preferences</h2>
          <p>
            A branded stats summary every Monday at 09:00 UTC, only while this
            takeover is live. You can unsubscribe here or in any digest.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={data.weeklyDigestEnabled}
              disabled={busy}
              onChange={async (e) => {
                const enabled = e.target.checked;
                setData({ ...data, weeklyDigestEnabled: enabled });
                setBusy(true);
                try {
                  await request("preferences", {
                    weeklyDigestEnabled: enabled,
                  });
                  setNotice(
                    enabled
                      ? "Weekly summaries enabled."
                      : "Weekly summaries stopped.",
                  );
                } catch (e) {
                  setData(data);
                  setError(e instanceof Error ? e.message : "Could not save.");
                } finally {
                  setBusy(false);
                }
              }}
            />
            Email me weekly summaries while I own the wall
          </label>
          <h3>Milestone alerts</h3>
          <p>
            For your checkout email, across all your takeovers. One alert when a
            milestone is within 10 counted takeovers; no number is reserved.
            Activation and final-report service emails remain enabled.
          </p>
          <p>
            Status:{" "}
            {data.milestoneAlerts === "on"
              ? "Subscribed"
              : data.milestoneAlerts === "pending"
                ? "Check your inbox to confirm"
                : "Not subscribed"}
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await request("preferences", {
                  milestoneAlertsEnabled:
                    !data.milestoneAlerts || data.milestoneAlerts === "off",
                });
                await refresh();
                setNotice(
                  data.milestoneAlerts && data.milestoneAlerts !== "off"
                    ? "Milestone alerts stopped."
                    : "Check your checkout email to confirm milestone alerts.",
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not save.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {data.milestoneAlerts && data.milestoneAlerts !== "off"
              ? "Stop milestone alerts"
              : "Send milestone confirmation"}
          </button>
        </section>
        <section className="owner-regions">
          <h2>Top regions</h2>
          {data.regions.length ? (
            <ul>
              {[...data.regions]
                .sort((a, b) => b.impressions - a.impressions)
                .slice(0, 5)
                .map((r) => (
                  <li key={r.regionCode}>
                    {r.regionCode === "ZZ" ? "Unknown" : r.regionCode}
                    <strong>
                      {r.impressions.toLocaleString("en-US")} views
                    </strong>
                  </li>
                ))}
            </ul>
          ) : (
            <p>No regional impressions yet.</p>
          )}
        </section>
      </div>
      <p role="status">{notice}</p>
    </>
  );
}
