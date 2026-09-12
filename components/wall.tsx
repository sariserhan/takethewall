"use client";
import { contentCta } from "@/lib/content";
import { HomepageMilestones } from "./milestones";
import { PublicFooter } from "./public-footer";
import Image from "next/image";
import { Arrow } from "./arrow";
import {
  ConvexProvider,
  ConvexReactClient,
  useQuery,
  useConvexConnectionState,
} from "convex/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import { ctr, duration, topRegions } from "@/lib/validation";
import { captureReturn, wallEvent } from "@/lib/client-events";
import { PurchaseSheet } from "./purchase-sheet";
import type { FunctionReturnType } from "convex/server";
type WallData = FunctionReturnType<typeof api.wall.current>;
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
export default function Wall() {
  const [convex] = useState(() => (url ? new ConvexReactClient(url) : null));
  return convex ? (
    <ConvexProvider client={convex}>
      <Connected />
    </ConvexProvider>
  ) : (
    <WallView data={null} connected={false} />
  );
}
const subscribeHydration = () => () => {};
function Connected() {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const data = useQuery(api.wall.current);
  const connection = useConvexConnectionState();
  return (
    <WallView
      data={data}
      connected={hydrated && connection.isWebSocketConnected}
    />
  );
}
function Clock({ since }: { since: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <>{since && now ? duration(now - since) : "00:00:00"}</>;
}
function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
interface Confirmation {
  state: "pending" | "active" | "replaced" | "invalid" | "expired";
  durationMs: number | null;
}
function WallView({
  data,
  connected,
}: {
  data: WallData | undefined;
  connected: boolean;
}) {
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [statusError, setStatusError] = useState(false),
    [cancelled, setCancelled] = useState(false),
    [returnToken, setReturnToken] = useState<string | null>(null),
    [changed, setChanged] = useState(false);
  const owner = data?.owner,
    adRef = useRef<HTMLAnchorElement>(null),
    previous = useRef<string | null>(null),
    tokenRef = useRef<string | null>(null);
  // Capture and strip the browser-only return token before event collection.
  useEffect(() => {
    const state = captureReturn();
    tokenRef.current = state.token;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize browser storage or a verified network result after hydration.
    setReturnToken(state.token);
    setCancelled(state.cancelled);
    if (
      state.cancelled ||
      new URLSearchParams(window.location.search).has("take")
    )
      setOpen(true);
  }, []);
  async function checkStatus(token: string) {
    try {
      const r = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!r.ok) throw new Error();
      const result = await r.json();
      setConfirmation(result);
      setStatusError(false);
      if (result.state === "active" || result.state === "replaced") {
        try {
          sessionStorage.removeItem("ttw-draft");
        } catch {}
      }
    } catch {
      setStatusError(true);
    }
  }
  // Subscribe confirmation UI to verified network results after ownership changes.
  useEffect(() => {
    if (!returnToken) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize browser storage or a verified network result after hydration.
    void checkStatus(returnToken);
    const delayed = window.setTimeout(
      () => void checkStatus(returnToken),
      12_000,
    );
    return () => clearTimeout(delayed);
  }, [returnToken, owner?.id]);
  useEffect(() => {
    if (!owner?.id) return;
    const id = owner.id;
    let visible = false;
    const attempt = () => {
      if (visible && document.visibilityState === "visible")
        void wallEvent(
          id,
          "impression",
          () => visible && document.visibilityState === "visible",
        );
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? false;
        attempt();
      },
      { threshold: 0.5 },
    );
    if (adRef.current) observer.observe(adRef.current);
    document.addEventListener("visibilitychange", attempt);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", attempt);
    };
  }, [owner?.id]);
  useEffect(() => {
    if (!owner?.id) return;
    if (previous.current && previous.current !== owner.id) {
      setChanged(true);
      const id = window.setTimeout(() => setChanged(false), 4000);
      previous.current = owner.id;
      return () => clearTimeout(id);
    }
    previous.current = owner.id;
  }, [owner?.id]);
  const numbers = (n: number | undefined) =>
    n === undefined ? "—" : n.toLocaleString("en-US");
  const regions = topRegions(data?.regions ?? []);
  const takeWall = () => {
    setOpen(true);
    setCancelled(false);
    if (owner) void wallEvent(owner.id, "take_wall_clicked");
  };
  let statusCopy = "Confirming your takeover…";
  if (statusError)
    statusCopy =
      "Confirmation is taking longer than expected. Please don’t pay again. Retry your status below.";
  else if (confirmation?.state === "active")
    statusCopy = "The wall is yours. For now.";
  else if (confirmation?.state === "replaced")
    statusCopy = `Your takeover went live. Someone else has already taken the wall. Your reign: ${duration(confirmation.durationMs ?? 0)}.`;
  else if (confirmation?.state === "pending")
    statusCopy =
      "Confirming your takeover… Waiting for verified payment. Please don’t pay again.";
  else if (
    confirmation?.state === "expired" ||
    confirmation?.state === "invalid"
  )
    statusCopy =
      "This confirmation link is invalid or expired. Check your receipt or contact support@takethewall.com before paying again.";
  return (
    <main className="wall-page">
      <header className="masthead">
        <h1>TAKE THE WALL</h1>
        <div className="strap">
          <p>One wall. One owner. $3.99.</p>
          <span className="connection">
            <i className={connected ? "online" : ""} />
            {connected ? "LIVE" : "CONNECTING"}
          </span>
        </div>
      </header>
      {returnToken && (
        <div className="notice" role="status">
          <p>{statusCopy}</p>
          {(!confirmation ||
            confirmation.state === "pending" ||
            statusError) && (
            <button onClick={() => void checkStatus(returnToken)}>
              Retry status ↻
            </button>
          )}
          <button
            aria-label="Dismiss confirmation"
            onClick={() => {
              setReturnToken(null);
              tokenRef.current = null;
              try {
                sessionStorage.removeItem("ttw-confirmation");
              } catch {}
            }}
          >
            ×
          </button>
        </div>
      )}
      {cancelled && (
        <div className="notice" role="status">
          Checkout cancelled. Your draft is saved; no ownership change has been
          confirmed.
        </div>
      )}
      <section className="site-metrics" aria-label="Site analytics">
        <Metric
          label="VISITORS TODAY (UTC)"
          value={numbers(
            data
              ? data.utcDate === new Date().toISOString().slice(0, 10)
                ? data.visitorsToday
                : 0
              : undefined,
          )}
        />
        <Metric label="TOTAL VISITORS" value={numbers(data?.totalVisitors)} />
        <Metric
          label="COUNTED TAKEOVERS"
          value={numbers(data?.totalTakeovers)}
        />
      </section>
      <section className="owner-section" aria-label="Current owner">
        <p className="eyebrow">
          CURRENT TAKEOVER{" "}
          {owner?.takeoverNumber
            ? `#${owner.takeoverNumber}${owner.kind === "admin_counted" ? " · ADMIN-ISSUED" : ""}`
            : owner?.kind === "admin_placement"
              ? "ADMIN PLACEMENT"
              : "HOUSE PLACEMENT"}
        </p>
        <p className="eyebrow ownership-label" aria-live="polite">
          {changed
            ? "THE WALL WAS JUST TAKEN"
            : "THIS WALL CURRENTLY BELONGS TO"}
        </p>
        {owner ? (
          <a
            key={owner.id}
            ref={adRef}
            className="owner-ad"
            href={owner.outboundLinkEnabled ? owner.websiteUrl : undefined}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() => {
              if (owner.outboundLinkEnabled) void wallEvent(owner.id, "click");
            }}
            onAuxClick={(e) => {
              if (e.button === 1 && owner.outboundLinkEnabled)
                void wallEvent(owner.id, "click");
            }}
          >
            {owner.logoUrl ? (
              <Image
                className="owner-logo"
                src={owner.logoUrl}
                alt={`${owner.domain} logo`}
                width={240}
                height={160}
                unoptimized
                priority
              />
            ) : null}
            <h2>{owner.displayName}</h2>
            <p>{owner.description}</p>
            {owner.outboundLinkEnabled && (
              <span className="visit">
                {contentCta(owner.linkType)} <Arrow />
              </span>
            )}
          </a>
        ) : (
          <div className="owner-ad loading-owner">
            <div className="loading-mark">W.</div>
            <h2>
              {data === undefined
                ? "Meeting the current owner…"
                : "The wall is warming up."}
            </h2>
            <p>
              {data === undefined
                ? "One moment. One wall."
                : "Please check back shortly."}
            </p>
          </div>
        )}
      </section>
      <section className="reign-metrics" aria-label="Current reign analytics">
        <Metric
          label="CURRENT REIGN"
          value={<Clock since={owner?.activatedAt ?? 0} />}
        />
        <Metric label="IMPRESSIONS" value={numbers(owner?.impressions)} />
        <Metric
          label="UNIQUE VISITORS"
          value={numbers(owner?.uniqueVisitors)}
        />
        <Metric label="CLICKS" value={numbers(owner?.clicks)} />
        <Metric
          label="CTR"
          value={
            owner
              ? `${ctr(owner.impressions, owner.clicks).toFixed(2).replace(/\.00$/, "")}%`
              : "—"
          }
        />
        <div className="regions">
          <span className="eyebrow">TOP REGIONS</span>
          {regions.length ? (
            <ul>
              {regions.map((r) => (
                <li key={r.regionCode}>
                  <span>
                    {r.regionCode === "ZZ" ? "Unknown" : r.regionCode}
                  </span>
                  <span>{r.percent.toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No impressions yet.</p>
          )}
        </div>
      </section>
      <section className="purchase-band">
        <strong className="price">$3.99</strong>
        <p>
          It could be yours for 1 second or 100 days.
          <br />
          Someone else pays $3.99, they take it.
        </p>
        <button className="button primary" onClick={takeWall}>
          TAKE THE WALL — $3.99 <Arrow />
        </button>
      </section>
      {data && <HomepageMilestones />}
      <PublicFooter home />
      <PurchaseSheet
        key={
          confirmation?.state === "active" || confirmation?.state === "replaced"
            ? "confirmed:" + returnToken
            : "draft"
        }
        open={open}
        onClose={() => setOpen(false)}
        onCheckout={() => {
          setReturnToken(null);
          try {
            sessionStorage.removeItem("ttw-confirmation");
          } catch {}
          if (owner) void wallEvent(owner.id, "checkout_started");
        }}
      />
    </main>
  );
}
