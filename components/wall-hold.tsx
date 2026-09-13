"use client";
import { useEffect, useRef, useState } from "react";
export function WallHold() {
  const [elapsed, setElapsed] = useState(0),
    [best, setBest] = useState(0),
    [holding, setHolding] = useState(false);
  const started = useRef<number | null>(null),
    frame = useRef(0),
    bestRef = useRef(0);
  function stop() {
    if (started.current === null) return;
    const value = Math.max(0, performance.now() - started.current);
    started.current = null;
    cancelAnimationFrame(frame.current);
    setElapsed(value);
    setHolding(false);
    bestRef.current = Math.max(bestRef.current, value);
    setBest(bestRef.current);
    try {
      localStorage.setItem("ttw-hold-best", String(bestRef.current));
    } catch {}
  }
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem("ttw-hold-best"));
      if (Number.isFinite(stored) && stored > 0) {
        bestRef.current = stored;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore a browser-local personal best.
        setBest(stored);
      }
    } catch {}
    const lost = () => stop();
    window.addEventListener("blur", lost);
    document.addEventListener("visibilitychange", lost);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("blur", lost);
      document.removeEventListener("visibilitychange", lost);
    };
  }, []);
  function start() {
    if (started.current !== null) return;
    started.current = performance.now();
    setElapsed(0);
    setHolding(true);
    const tick = () => {
      if (started.current === null) return;
      setElapsed(performance.now() - started.current);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }
  return (
    <section className="hold-challenge">
      <p>One button. How long can you hold it?</p>
      <output className="hold-clock">{(elapsed / 1000).toFixed(1)}s</output>
      <button
        className="hold-pad"
        aria-pressed={holding}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onBlur={stop}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            if (!e.repeat) start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            stop();
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {holding ? "KEEP HOLDING" : "PRESS & HOLD"}
      </button>
      <p>Personal best: {(best / 1000).toFixed(1)}s</p>
      <p role="status">
        {Math.max(best, elapsed) >= 30000
          ? "✦ STEADY HAND · 30-second badge unlocked"
          : "Hold for 30 seconds to unlock Steady Hand."}
      </p>
      <small>
        Saved in this browser. A cosmetic challenge, with no prize or takeover
        credit. Leaving this tab ends your hold. Keyboard: hold Space or Enter.
      </small>
    </section>
  );
}
