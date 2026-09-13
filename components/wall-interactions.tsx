"use client";
import { useEffect, useRef, useState } from "react";
import { EffectLayer } from "./effect-layer";
import {
  setInteractionMode,
  useInteractionMode,
} from "./wall-interaction-mode";
export function WallInteractions() {
  const mode = useInteractionMode();
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ttw-interaction");
      setInteractionMode(
        saved === "thermal" || saved === "theremin" ? saved : "off",
      );
    } catch {}
    const sync = (event: StorageEvent) => {
      if (event.key === "ttw-interaction")
        setInteractionMode(
          event.newValue === "thermal" || event.newValue === "theremin"
            ? event.newValue
            : "off",
        );
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (mode === "off") return;
    const exit = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setInteractionMode("off");
      }
    };
    document.addEventListener("keydown", exit, true);
    return () => document.removeEventListener("keydown", exit, true);
  }, [mode]);
  if (mode === "off") return null;
  return (
    <EffectLayer>
      {mode === "thermal" ? <PageThermal /> : <PageTheremin />}
    </EffectLayer>
  );
}
function PageThermal() {
  const canvas = useRef<HTMLCanvasElement>(null),
    clear = useRef(() => {});
  useEffect(() => {
    const element = canvas.current,
      ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    let frame = 0,
      latest: { x: number; y: number } | null = null,
      until = 0,
      last = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const resize = () => {
      element.width = innerWidth;
      element.height = innerHeight;
    };
    const erase = () => {
      ctx.clearRect(0, 0, element.width, element.height);
      latest = null;
      until = 0;
    };
    clear.current = erase;
    const paint = (now: number) => {
      frame = 0;
      const elapsed = Math.min(100, now - (last || now));
      last = now;
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0,0,0,${1 - Math.exp(-elapsed / 360)})`;
      ctx.fillRect(0, 0, element.width, element.height);
      ctx.globalCompositeOperation = "source-over";
      if (latest) {
        if (reduced.matches) ctx.clearRect(0, 0, element.width, element.height);
        const { x, y } = latest,
          radius = 46;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, "#fff5a6b8");
        glow.addColorStop(0.23, "#ffb11eb0");
        glow.addColorStop(0.55, "#ff341778");
        glow.addColorStop(1, "#db168000");
        ctx.fillStyle = glow;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        latest = null;
      }
      if (!reduced.matches && now < until) frame = requestAnimationFrame(paint);
      else if (!reduced.matches)
        ctx.clearRect(0, 0, element.width, element.height);
    };
    const add = (x: number, y: number) => {
      latest = { x, y };
      until = performance.now() + 1800;
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(paint);
      }
    };
    const pointer = (e: PointerEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest(".interaction-controls")
      )
        return;
      add(e.clientX, e.clientY);
    };
    const focus = () => {
      const target = document.activeElement;
      if (
        target instanceof HTMLElement &&
        !target.closest(".interaction-controls")
      ) {
        const r = target.getBoundingClientRect();
        add(r.left + r.width / 2, r.top + r.height / 2);
      }
    };
    const hidden = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        erase();
      }
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("blur", erase);
    document.addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("pointerdown", pointer, { passive: true });
    document.addEventListener("focusin", focus);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", erase);
      document.removeEventListener("pointermove", pointer);
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("visibilitychange", hidden);
      clear.current = () => {};
    };
  }, []);
  return (
    <>
      <canvas ref={canvas} className="page-thermal" aria-hidden="true" />
      <aside className="interaction-controls" aria-label="Thermal controls">
        <span>
          THERMAL<small>Your pointer only · never shared</small>
        </span>
        <button onClick={() => clear.current()}>Clear trail</button>
        <button onClick={() => setInteractionMode("off")}>
          Exit Thermal <kbd>Esc</kbd>
        </button>
      </aside>
    </>
  );
}
function PageTheremin() {
  const sound = useRef<{
    ctx: AudioContext;
    osc: OscillatorNode;
    gain: GainNode;
    filter: BiquadFilterNode;
    depth: GainNode;
  } | null>(null);
  const aura = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false),
    [error, setError] = useState("");
  function stop() {
    void sound.current?.ctx.close().catch(() => {});
    sound.current = null;
    setActive(false);
  }
  async function start() {
    if (sound.current) return;
    setError("");
    try {
      const ctx = new AudioContext(),
        osc = ctx.createOscillator(),
        gain = ctx.createGain(),
        filter = ctx.createBiquadFilter(),
        vibrato = ctx.createOscillator(),
        depth = ctx.createGain();
      gain.gain.value = 0;
      osc.type = "sine";
      vibrato.frequency.value = 5;
      depth.gain.value = 8;
      filter.type = "lowpass";
      filter.frequency.value = 2000;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      vibrato.connect(depth);
      depth.connect(osc.frequency);
      osc.start();
      vibrato.start();
      sound.current = { ctx, osc, gain, filter, depth };
      await ctx.resume();
      if (sound.current?.ctx === ctx) setActive(true);
    } catch {
      stop();
      setError("Audio is unavailable in this browser.");
    }
  }
  useEffect(() => {
    let frame = 0,
      x = innerWidth / 2,
      y = innerHeight / 2;
    const paint = () => {
      frame = 0;
      const node = aura.current;
      if (node) {
        node.style.setProperty("--theremin-x", `${x}px`);
        node.style.setProperty("--theremin-y", `${y}px`);
      }
    };
    const silence = () => {
      const s = sound.current;
      if (s) s.gain.gain.setTargetAtTime(0, s.ctx.currentTime, 0.03);
    };
    const move = (clientX: number, clientY: number) => {
      x = clientX;
      y = clientY;
      if (!frame) frame = requestAnimationFrame(paint);
      const s = sound.current;
      if (
        !s ||
        document.hidden ||
        document.documentElement.dataset.wallFrozen === "on"
      )
        return;
      const nx = Math.max(0, Math.min(1, x / innerWidth)),
        ny = Math.max(0, Math.min(1, y / innerHeight)),
        t = s.ctx.currentTime;
      s.osc.frequency.setTargetAtTime(110 * 2 ** (nx * 3), t, 0.03);
      s.filter.frequency.setTargetAtTime(400 + (1 - ny) * 4000, t, 0.03);
      s.depth.gain.setTargetAtTime(ny * 18, t, 0.03);
      s.gain.gain.setTargetAtTime(0.03, t, 0.03);
    };
    const pointer = (e: PointerEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest(
          ".interaction-controls,input,textarea,select,[contenteditable],iframe",
        )
      ) {
        silence();
        return;
      }
      move(e.clientX, e.clientY);
    };
    const focus = () => {
      const target = document.activeElement;
      if (target instanceof HTMLElement) {
        if (
          target.closest(
            ".interaction-controls,input,textarea,select,[contenteditable],iframe",
          )
        ) {
          silence();
          return;
        }
        const r = target.getBoundingClientRect();
        move(r.left + r.width / 2, r.top + r.height / 2);
      }
    };
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("pointerdown", pointer, { passive: true });
    document.addEventListener("pointerup", silence);
    document.addEventListener("pointercancel", silence);
    document.addEventListener("pointerout", leave);
    document.addEventListener("focusin", focus);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", silence);
    function leave(e: PointerEvent) {
      if (!e.relatedTarget) silence();
    }
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", pointer);
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("pointerup", silence);
      document.removeEventListener("pointercancel", silence);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", silence);
      void sound.current?.ctx.close().catch(() => {});
      sound.current = null;
    };
  }, []);
  return (
    <>
      <div ref={aura} className="page-theremin" aria-hidden="true" />
      <aside className="interaction-controls" aria-label="Theremin controls">
        <span>
          THEREMIN
          <small>
            {error ||
              (active
                ? "Move or touch · left/right pitch · up/down tone"
                : "Sound off · start to play across the page")}
          </small>
        </span>
        <button onClick={() => (active ? stop() : void start())}>
          {active ? "Mute instrument" : "Start instrument"}
        </button>
        <button onClick={() => setInteractionMode("off")}>
          Exit Theremin <kbd>Esc</kbd>
        </button>
      </aside>
    </>
  );
}
