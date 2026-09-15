"use client";
import Link from "next/link";
import { CrumblingWall, Gazette, CommunityEvent } from "./community-wall";
import { WhisperPreview } from "./whisper-room";
import { KeepOrYeet } from "./keep-or-yeet";
import { MicroAma } from "./micro-ama";
import { MorseTool, WallCreativeTools } from "./wall-creative-tools";
import { WallToolIcon } from "./wall-tool-icon";
import { TryMine } from "./try-mine";
import { MagneticTitle, PulseTool, WallExperiments } from "./wall-experiments";
import { WallLab, StatToolButton } from "./wall-lab";
import type { LabPanel } from "./wall-lab-panel";
import { WallActions } from "./wall-actions";
import { HackerTerminal } from "./hacker-terminal";
import { HallOfFame } from "./hall-of-fame";
import { MobilePurchaseBar, TakeoverSound } from "./live-controls";
import { publicConvexClient } from "@/lib/convex-client";
import { trackVerifiedTakeover } from "@/lib/visitorping-client";
import { RegionLabel } from "./region-label";
import { ResumeCheckout } from "./resume-checkout";
import { PublishedShare } from "./takeover-share";
import { WallSubscription } from "./wall-subscription";
import { MilestoneAlerts } from "./milestone-alerts";
import { ReportContent } from "./report-content";
import { WallCanvas } from "./wall-canvas";
import { WallPresence } from "./wall-presence";
import { RadarArrivalSound } from "./radar-arrival-sound";
import { StatShare } from "./stat-share";
import { StatDetails } from "./stat-details";
import { StatHelp } from "./stat-help";
import { contentCta } from "@/lib/content";
import { HomepageMilestones } from "./milestones";
import { PublicFooter } from "./public-footer";
import Image from "next/image";
import { Arrow } from "./arrow";
import {
  ConvexProvider,
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
export default function Wall() {
  const [convex] = useState(publicConvexClient);
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
  const controls = useQuery(api.checkoutControls.state);
  const connection = useConvexConnectionState();
  return (
    <>
    <RadarArrivalSound />
    <WallPresence takeoverId={data?.owner?.id} />
    <WallView
      data={data}
      checkoutPaused={controls?.paused ?? false}
      connected={hydrated && connection.isWebSocketConnected}
    />
    </>
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
function Metric({ label, value, action }: {
  label: string;
  value: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="metric">
      <span className={action ? "stat-heading" : undefined}>
        <StatHelp label={label} />
        {action}
      </span>
      <strong>{value}</strong>
    </div>
  );
}
interface Confirmation {
  previousOwnerName?: string | null;
  publicId?: string;
  state: "pending" | "active" | "replaced" | "invalid" | "expired";
  durationMs: number | null;
}
function WallView({
  checkoutPaused = false,
  data,
  connected,
}: {
  checkoutPaused?: boolean;
  data: WallData | undefined;
  connected: boolean;
}) {
  const [labPanel, setLabPanel] = useState<LabPanel | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [trying, setTrying] = useState(false);
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [statusError, setStatusError] = useState(false),
    [cancelled, setCancelled] = useState(false),
    [returnToken, setReturnToken] = useState<string | null>(null),
    [changed, setChanged] = useState(false);
  const since = data?.owner.activatedAt ?? 0;
  const owner = data?.owner,
    adRef = useRef<HTMLElement>(null),
    purchaseRef = useRef<HTMLButtonElement>(null),
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
        trackVerifiedTakeover(result.visitorPing);
        setOpen(false);
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
    const delayed = window.setInterval(
      () => void checkStatus(returnToken),
      4000,
    );
    const stop = window.setTimeout(() => window.clearInterval(delayed), 60_000);
    return () => {
      window.clearInterval(delayed);
      window.clearTimeout(stop);
    };
  }, [returnToken, owner?.id]);
  useEffect(() => {
    if (!owner?.id || trying) return;
    const id = owner.id;
    let visible = false;
    const attempt = () => {
      if (visible && document.visibilityState === "visible" && document.documentElement.dataset.wallFrozen !== "on")
        void wallEvent(
          id,
          "impression",
          () => visible && document.visibilityState === "visible" && document.documentElement.dataset.wallFrozen !== "on",
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
      visible = false;
      observer.disconnect();
      document.removeEventListener("visibilitychange", attempt);
    };
  }, [owner?.id, trying]);
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
  const realToday = data
    ? data.utcDate === new Date().toISOString().slice(0, 10)
      ? data.visitorsToday
      : 0
    : undefined;
  const viewsToday = data
    ? data.utcDate === new Date().toISOString().slice(0, 10)
      ? data.viewsToday
      : 0
    : undefined;
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
    statusCopy = "Your wall is live. Payment verified and placement published.";
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
      <div className="wall-viewport">
        <header className="masthead">
          <MagneticTitle />
          <div className="strap">
            <p>Your project. This entire wall. Until the next takeover.</p>
            <div className="masthead-status">
              <span className="connection">
                <i className={connected ? "online" : ""} />
                {connected ? "LIVE" : "CONNECTING"}
              </span>
              <StatDetails label="All-time visits" className="lifetime-visits" trigger={<><strong>{numbers(data?.totalViews)}</strong><span>ALL-TIME VISITS</span></>} title="Website visit totals" rows={[
              { label: "Visits · all time", value: numbers(data?.totalViews) },
              { label: "Unique visitors · all time", value: numbers(data?.totalVisitors) },
              { label: "Unique visitors · today (UTC)", value: numbers(realToday) },
              { label: "Views · today (UTC)", value: numbers(viewsToday) },
            ]}><p>All-time visits count recorded wall views, including repeat visits from the same browser. Today’s views are already included in that total. Unique visitors are shown separately.</p></StatDetails>
            </div>
          </div>
        </header>
        {returnToken && (
          <div className="notice" role="status">
            <p>{statusCopy}</p>
            {confirmation?.publicId && (
              <PublishedShare
                key={confirmation.publicId}
                publicId={confirmation.publicId}
                previousOwnerName={confirmation.previousOwnerName}
              />
            )}
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
            Checkout cancelled. Your draft is saved; no ownership change has
            been confirmed.
          </div>
        )}
        <section className="site-metrics" aria-label="Site analytics">
          <Metric
            label="VIEWS TODAY (UTC)"
            action={<StatToolButton name="Radar" onClick={() => setLabPanel("Radar")} />}
            value={numbers(viewsToday)}
          />
          <Metric
            label="VIEWS THIS TAKEOVER"
            action={<StatToolButton name="Radar" onClick={() => setLabPanel("Takeover Radar")} />}
            value={numbers(owner?.impressions)}
          />
          <Metric
            label="COUNTED TAKEOVERS"
            action={
              <>
                {owner?.publicId && (
                  <Link className="stat-tool-button" aria-label="Current takeover" data-tooltip="Current takeover" href={`/takeover/${owner.publicId}`}>
                    <WallToolIcon name="popout" /> Current takeover
                  </Link>
                )}
                {!owner?.publicId && <StatDetails label="Current takeover" title="Current takeover" rows={[]}><p>The current takeover’s public page is not available yet.</p></StatDetails>}
              </>
            }
            value={
              <>{numbers(data?.totalTakeovers)}</>
            }
          />
          <div className="metric previous-owner-stat">
            <span className="stat-heading">
              <StatHelp label="PREVIOUS OWNER" />
              <StatToolButton name="Audit" onClick={() => setLabPanel("Audit")} />
            </span>
            <strong>
              {data ? (data.previousOwnerName ?? "First reign") : "—"}
            </strong>
            {data && !data.previousOwnerName && (
              <small className="stat-empty-hint">The next takeover starts the history.</small>
            )}
          </div>
        </section>
          {!trying && (
            <div className="owner-identity-strip">
              <PulseTool compact ownerId={owner?.id} name={owner?.displayName} />
              <div className="owner-identity-center">
              {owner && <span className="owner-live-status"><i aria-hidden="true" /> CURRENT OWNER{owner.takeoverNumber ? ` · #${owner.takeoverNumber}` : ""}</span>}
              </div>
              <button
                type="button"
                className="report-content-trigger"
                aria-controls="current-wall"
                onClick={() => {
                  setTrying(true);
                  requestAnimationFrame(() => document.querySelector(".try-mine")?.scrollIntoView({ block: "center" }));
                }}
              >
                Try mine
              </button>
            </div>
          )}
        <section id="current-wall" ref={adRef} className={`owner-section${owner?.canvasDesign && !trying ? " has-wall-design" : ""}`} aria-label="Current owner">
          {!owner && <p className="eyebrow">CURRENT TAKEOVER · LOADING</p>}
          {(!owner || trying || changed) && <p
            className={`eyebrow ownership-label${changed ? " takeover-arrived" : ""}`}
            aria-live="polite"
          >
            {trying
              ? "TRY YOUR CONTENT ON THE WALL"
              : changed
                ? "THE WALL WAS JUST TAKEN"
                : "THIS WALL CURRENTLY BELONGS TO"}
          </p>}
          {trying ? <TryMine onClose={() => setTrying(false)} onPrepare={() => { setTrying(false); setDraftVersion(v=>v+1); setOpen(true); }} /> : owner?.canvasDesign ? (
            <div className="canvas-owner-ad"><WallCanvas linksEnabled={owner.canvasLinksEnabled ?? owner.outboundLinkEnabled} design={owner.canvasDesign} images={owner.canvasImages} href={owner.outboundLinkEnabled ? owner.websiteUrl : undefined} onVisit={() => void wallEvent(owner.id,"click")} /></div>
          ) : owner ? (
            <a
              key={owner.id}
              className="owner-ad"
              href={owner.outboundLinkEnabled ? owner.websiteUrl : undefined}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => {
                if (owner.outboundLinkEnabled)
                  void wallEvent(owner.id, "click");
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
              <div className="loading-mark">
                <Image
                  src="/brand/takethewall-icon.svg"
                  alt=""
                  width={80}
                  height={80}
                  unoptimized
                  style={{
                    margin: "0 auto",
                    width: "clamp(48px, 8dvh, 80px)",
                    height: "auto",
                  }}
                />
              </div>
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
        {owner && (
          <div className="wall-owner-tools">
            {!trying && <MorseTool message={owner.morseMessage || owner.description || owner.displayName || ""} />}
            {owner && <ReportContent
              takeoverId={owner.id}
              name={owner.displayName || owner.domain}
            />}
          </div>
        )}
        <section className="reign-metrics" aria-label="Current reign analytics">
          <Metric
            label="CURRENT REIGN"
            action={<StatToolButton name="Snapshot" onClick={() => setLabPanel("Snapshot")} />}
            value={
              <>
                <Clock since={since} />
                {since > 0 && (
                  <time
                    className="owner-since"
                    dateTime={new Date(since).toISOString()}
                  >
                    <StatHelp label="Owner since" />{" "}
                    {new Date(since)
                      .toISOString()
                      .replace("T", " ")
                      .slice(0, 19)}{" "}
                    UTC
                  </time>
                )}
              </>
            }
          />
          <Metric
            label="UNIQUE VISITORS"
            action={<StatShare name={owner?.displayName} />}
            value={numbers(
              owner?.uniqueVisitors,
            )}
          />
          <Metric
            label="CLICKS"
            action={owner?.outboundLinkEnabled && owner.websiteUrl ? <a className="stat-tool-button" aria-label="Visit website" data-tooltip="Visit website" href={owner.websiteUrl} target="_blank" rel="noopener noreferrer sponsored" onClick={() => void wallEvent(owner.id, "click")} onAuxClick={event => { if (event.button === 1) void wallEvent(owner.id, "click"); }}><WallToolIcon name="popout" /> Visit website</a> : <button type="button" className="stat-tool-button" aria-label="Visit website unavailable" data-tooltip="No website link" disabled title="The current owner has no enabled outbound link"><WallToolIcon name="popout" /> Visit website</button>}
            value={numbers(owner?.clicks)}
          />
          <Metric
            label="CTR"
            action={<StatDetails label="Calculation" title="Click-through rate calculation" rows={[
              { label: "Displayed clicks", value: numbers(owner?.clicks) },
              { label: "Displayed impressions", value: numbers(owner?.impressions) },
              { label: "CTR", value: owner ? `${ctr(owner.impressions, owner.clicks).toFixed(2)}%` : "—" },
            ]}><p>CTR = clicks ÷ impressions × 100. With no impressions, the rate is shown as 0%.</p></StatDetails>}
            value={
              owner
                ? `${ctr(
                    owner.impressions,
                    owner.clicks,
                  )
                    .toFixed(2)
                    .replace(/\.00$/, "")}%`
                : "—"
            }
          />
          <div className="metric referral-prize-stat">
            <span className="stat-heading"><StatHelp label="REFERRALS" />
              {owner?.publicId ? <StatShare key={owner.publicId} publicId={owner.publicId} name={owner.displayName} /> : <button type="button" className="stat-tool-button" aria-label="Share referral unavailable" disabled><WallToolIcon name="share" />Share referral</button>}
            </span>
            <strong>{owner ? numbers(owner.shareVisitors ?? 0) : "—"}</strong>
            <small className="referral-prize-label">Referral prize · Reward B</small>
            <small className="referral-prize-hint">Share this takeover’s link to support its referral count</small>
          </div>
          <div className="regions">
            <span className="eyebrow stat-heading">
              <StatHelp label="TOP REGIONS" />
              <StatToolButton name="Globe" onClick={() => setLabPanel("Globe")} />
            </span>
            {regions.length ? (
              <ul>
                {regions.map((r) => (
                  <li key={r.regionCode}>
                    <RegionLabel code={r.regionCode} />
                    <span>{r.percent.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {owner
                  ? "No regional breakdown yet."
                  : "Waiting for analytics."}
              </p>
            )}
          </div>
        </section>
        {(!connected || !owner || owner.impressions === 0) && (
          <p className="analytics-status" role="status">
            {!connected
              ? owner
                ? "Reconnecting. Showing the last received counts while your placement stays visible."
                : "Connecting to the wall. Counts will appear when data is available."
              : !owner
                ? "Waiting for the wall’s analytics. Unavailable counts are shown as a dash, not zero."
                : "This placement is live. Recorded views and clicks will appear here as they arrive."}
          </p>
        )}
        <a
          className="analytics-credit"
          href="https://visitorping.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Live analytics powered by <strong>VisitorPing</strong> ↗
        </a>
        <section className="purchase-band">
          <strong className="price">$4.99</strong>
          <p>
            Design your wall. Preview it. Make it live.
            <br />
            It stays until the next takeover replaces it.
          </p>
          <button
            ref={purchaseRef}
            className="button primary"
            onClick={takeWall}
            disabled={checkoutPaused}
          >
            {checkoutPaused ? "NEW CHECKOUTS PAUSED" : "TAKE THE WALL — $4.99"}{" "}
            <Arrow />
          </button>
        </section>
      </div>
      <HomepageMilestones />
      {owner && (
        <div className="audience-row">
          <KeepOrYeet key={"vote:"+owner.id} takeoverId={owner.id} name={owner.displayName} />
          <WhisperPreview key={"whisper:"+owner.id} takeoverId={owner.id} name={owner.displayName} />
        </div>
      )}
      {owner && <MicroAma key={owner.id} takeoverId={owner.id} name={owner.displayName} />}
      <CommunityEvent />
      <HallOfFame />
      <CrumblingWall />
      <Gazette />
      <MobilePurchaseBar
        target={purchaseRef}
        onTake={takeWall}
        paused={checkoutPaused}
      />
      <section className="wall-follow" aria-labelledby="wall-follow-title">
        <div className="wall-follow-heading">
          <span className="eyebrow">FOLLOW ALONG</span>
          <h2 id="wall-follow-title">Stay in the loop.</h2>
          <p>Choose the updates you want. Unsubscribe anytime.</p>
        </div>
        <WallSubscription />
        <MilestoneAlerts />
      </section>
      <section className="wall-explore" aria-labelledby="wall-explore-title">
        <div className="wall-explore-heading">
          <h2 id="wall-explore-title">Explore the wall</h2>
          <p>Share it, inspect it, or play. These tools are optional.</p>
        </div>
      <div className="wall-tools">
        <div className="wall-tools-primary">
        <HackerTerminal
          connected={connected}
          paused={checkoutPaused}
          snapshot={
            owner
              ? {
                  name: owner.displayName,
                  number: owner.takeoverNumber,
                  impressions: owner.impressions,
                  visitors: owner.uniqueVisitors,
                  clicks: owner.clicks,
                }
              : null
          }
          onPrepare={() => {
            setDraftVersion((v) => v + 1);
            setOpen(true);
          }}
        />
        <TakeoverSound changed={changed} />
        <WallActions />
        <WallLab panel={labPanel} setPanel={setLabPanel} data={owner ? { id: owner.id, name: owner.displayName, contentType: owner.contentType, logoUrl: owner.logoUrl, activatedAt: owner.activatedAt, visitors: owner.uniqueVisitors, number: owner.takeoverNumber, regions: data?.regions ?? [], includesDemo: false } : null} />
        </div>
          <div className="experiment-menu-controls" role="group" aria-labelledby="playground-title">
            <h3 id="playground-title" className="eyebrow">Playground</h3>
            <WallExperiments />
            <WallCreativeTools data={owner ? { id:owner.id,name:owner.displayName,message:owner.description,websiteUrl:owner.websiteUrl,morseMessage:owner.morseMessage,logoUrl:owner.logoUrl,number:owner.takeoverNumber,activatedAt:owner.activatedAt,visitors:owner.uniqueVisitors,includesDemo:false } : null}/>
          </div>
      </div>
      </section>
      <PublicFooter home />
      <ResumeCheckout />
      <PurchaseSheet
        key={
          confirmation?.state === "active" || confirmation?.state === "replaced"
            ? "confirmed:" + returnToken + ":" + draftVersion
            : "draft:" + draftVersion
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
