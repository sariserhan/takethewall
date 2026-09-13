"use client";
import { WallToolIcon } from "./wall-tool-icon";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "./dialog";
import type { PulseResult } from "@/lib/site-pulse";
const Hold = dynamic(() => import("./wall-hold").then((m) => m.WallHold), {
  ssr: false,
});
export function MagneticTitle({ enabled }: { enabled: boolean }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!enabled || !title.current) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const node = title.current;
    const letters = Array.from(node.querySelectorAll("span"));
    const springs = letters.map(() => ({ x: 0, y: 0, vx: 0, vy: 0 }));
    let pointer: { x: number; y: number } | null = null,
      frame = 0;
    const tick = () => {
      let moving = false;
      const boxes = letters.map((el) => el.getBoundingClientRect());
      letters.forEach((el, i) => {
        const s = springs[i],
          box = boxes[i];
        const dx = pointer ? box.left + box.width / 2 - s.x - pointer.x : 0;
        const dy = pointer ? box.top + box.height / 2 - s.y - pointer.y : 0;
        const distance = Math.hypot(dx, dy),
          force = pointer ? Math.max(0, 1 - distance / 160) * 28 : 0;
        s.vx = (s.vx + ((dx / (distance || 1)) * force - s.x) * 0.12) * 0.72;
        s.vy = (s.vy + ((dy / (distance || 1)) * force - s.y) * 0.12) * 0.72;
        s.x += s.vx;
        s.y += s.vy;
        moving ||=
          Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.x) + Math.abs(s.y) > 0.1;
        el.style.transform = `translate(${s.x}px,${s.y}px)`;
      });
      frame = moving ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      if (reduced.matches || e.pointerType !== "mouse") return;
      pointer = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const leave = () => {
      pointer = null;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerleave", leave);
    reduced.addEventListener("change", leave);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
      reduced.removeEventListener("change", leave);
      letters.forEach((el) => el.style.removeProperty("transform"));
    };
  }, [enabled]);
  return (
    <h1 ref={title} aria-label="TAKE THE WALL" className="magnetic-title">
      {Array.from("TAKE THE WALL").map((letter, i) => (
        <span aria-hidden="true" key={i}>
          {letter === " " ? "\u00a0" : letter}
        </span>
      ))}
    </h1>
  );
}
export function WallExperiments({
  ownerId,
  name,
  magnet,
  onMagnet,
  onTry,
}: {
  ownerId?: string;
  name?: string;
  magnet: boolean;
  onMagnet: () => void;
  onTry: () => void;
}) {
  const [panel, setPanel] = useState<"Hold" | "Pulse" | null>(null),
    [rave, setRave] = useState(false),
    [beat, setBeat] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.wallRave = rave ? "on" : "off";
    return () => {
      delete document.documentElement.dataset.wallRave;
    };
  }, [rave]);
  useEffect(() => {
    if (!rave || !beat) return;
    let audio: AudioContext;
    try {
      audio = new AudioContext();
      void audio.resume().catch(() => {});
    } catch {
      return;
    }
    let step = 0;
    const tick = () => {
      if (
        document.hidden ||
        document.documentElement.dataset.wallFrozen === "on" ||
        audio.state !== "running"
      )
        return;
      const oscillator = audio.createOscillator(),
        gain = audio.createGain(),
        now = audio.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.value = [110, 138.59, 164.81, 138.59][step++ % 4];
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.025, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(now + 0.4);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    };
    tick();
    const timer = setInterval(tick, 600);
    return () => {
      clearInterval(timer);
      void audio.close().catch(() => {});
    };
  }, [rave, beat]);
  return (
    <>
      <button className="wall-action" onClick={onTry}>
        <WallToolIcon name="preview" /> Try Mine
      </button>
      <button className="wall-action" onClick={() => setPanel("Hold")}>
        <WallToolIcon name="hold" /> Hold
      </button>
      <button className="wall-action" onClick={() => setPanel("Pulse")}>
        <WallToolIcon name="pulse" /> Pulse
      </button>
      <button
        className="wall-action"
        aria-pressed={magnet}
        onClick={onMagnet}
        title="Move your mouse over the title. Respects reduced motion."
      >
        <WallToolIcon name="magnet" /> Magnet
      </button>
      <button
        className="wall-action"
        aria-pressed={rave}
        onClick={() => {
          setRave(!rave);
          setBeat(false);
        }}
      >
        <WallToolIcon name="rave" /> Rave
      </button>
      {rave && (
        <button
          className="wall-action"
          aria-pressed={beat}
          onClick={() => setBeat(!beat)}
        >
          <WallToolIcon name={beat ? "sound" : "muted"} /> Rave beat {beat ? "on" : "off"}
        </button>
      )}
      <Dialog
        open={panel !== null}
        onClose={() => setPanel(null)}
        title={panel ?? "Wall tools"}
      >
        {panel === "Hold" && <Hold />}
        {panel === "Pulse" && (
          <Pulse key={ownerId} ownerId={ownerId} name={name} />
        )}
      </Dialog>
    </>
  );
}
function Pulse({ ownerId, name }: { ownerId?: string; name?: string }) {
  const [result, setResult] = useState<PulseResult | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function check() {
    if (!ownerId || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    controller.current = new AbortController();
    try {
      const r = await fetch("/api/pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeoverId: ownerId }),
        signal: controller.current.signal,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not check this site.");
      setResult(data);
    } catch (e) {
      if (!controller.current?.signal.aborted)
        setError(e instanceof Error ? e.message : "Could not check this site.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="pulse-check">
      <h3>{name || "Current owner"}</h3>
      <p>
        Check the published website from our server. Results may be reused for
        one minute.
      </p>
      <button
        className="wall-action"
        disabled={!ownerId || busy}
        onClick={() => void check()}
      >
        <WallToolIcon name="pulse" /> {busy ? "Checking…" : "Check website"}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div role="status">
          <h3>
            {result.outcome === "responded"
              ? `HTTP ${result.status} · Response received`
              : "Unable to confirm availability"}
          </h3>
          <dl>
            <dt>Server check duration</dt>
            <dd>{result.elapsedMs} ms</dd>
            <dt>HTTPS certificate</dt>
            <dd>
              {result.tlsVerified
                ? "Verified for this connection"
                : "Not confirmed"}
            </dd>
            <dt>Checked at</dt>
            <dd>
              {new Date(result.checkedAt)
                .toISOString()
                .replace("T", " ")
                .replace(/\.\d+Z$/, " UTC")}
            </dd>
          </dl>
        </div>
      )}
      <small>
        A HEAD request measures the server response, not page loading speed.
        Redirects are not followed. A blocked request, timeout, or rejected HEAD
        request does not prove the website is down.
      </small>
    </section>
  );
}
