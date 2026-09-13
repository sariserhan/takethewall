"use client";
import { useEffect, useRef, useState } from "react";
import { encodeMorse } from "@/lib/morse";
export function MorseRadio({ message }: { message: string }) {
  const encoded = encodeMorse(message),
    audio = useRef<AudioContext | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playing, setPlaying] = useState(false),
    [lit, setLit] = useState(false),
    [error, setError] = useState("");
  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    void audio.current?.close().catch(() => {});
    audio.current = null;
    setPlaying(false);
    setLit(false);
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      if (timer.current) clearInterval(timer.current);
      void audio.current?.close().catch(() => {});
    };
  }, []);
  async function play() {
    stop();
    setError("");
    try {
      const ctx = new AudioContext();
      audio.current = ctx;
      await ctx.resume();
      if (audio.current !== ctx) return;
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.frequency.value = 620;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + 0.05,
        unit = 0.12;
      gain.gain.value = 0;
      encoded.tones.forEach((t) => {
        const a = start + t.start * unit,
          b = start + t.end * unit;
        gain.gain.setValueAtTime(0, a);
        gain.gain.linearRampToValueAtTime(0.04, a + 0.005);
        gain.gain.setValueAtTime(0.04, b - 0.005);
        gain.gain.linearRampToValueAtTime(0, b);
      });
      oscillator.start(start);
      oscillator.stop(start + encoded.units * unit + 0.1);
      setPlaying(true);
      timer.current = setInterval(() => {
        const elapsed = (ctx.currentTime - start) / unit;
        setLit(
          encoded.tones.some((t) => elapsed >= t.start && elapsed < t.end),
        );
        if (elapsed > encoded.units + 0.8) stop();
      }, 40);
    } catch {
      stop();
      setError(
        "Audio is unavailable in this browser. The Morse text is still available below.",
      );
    }
  }
  return (
    <section className="radio-panel">
      <p className="eyebrow">PUBLIC OWNER MESSAGE · TELEGRAPH</p>
      <blockquote>{message || "No message available."}</blockquote>
      <div className={`radio-lamp${lit ? " lit" : ""}`} aria-hidden="true" />
      <pre className="morse-code">
        {encoded.display || "No supported characters."}
      </pre>
      <div className="creative-actions">
        <button
          onClick={() => void play()}
          disabled={playing || !encoded.tones.length}
        >
          Play Morse
        </button>
        <button onClick={stop} disabled={!playing}>
          Stop
        </button>
      </div>
      <p role="status">
        {error || (playing ? "Transmitting…" : "Radio silent.")}
      </p>
      <small>
        First 160 characters. Letters, numbers and common punctuation;
        unsupported characters are omitted. Sound starts only when you press
        Play.
      </small>
    </section>
  );
}
export function Theremin() {
  const sound = useRef<{
    ctx: AudioContext;
    osc: OscillatorNode;
    gain: GainNode;
    filter: BiquadFilterNode;
    depth: GainNode;
  } | null>(null);
  const [active, setActive] = useState(false),
    [error, setError] = useState(""),
    [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  function stop() {
    void sound.current?.ctx.close().catch(() => {});
    sound.current = null;
    setActive(false);
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      void sound.current?.ctx.close().catch(() => {});
    };
  }, []);
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
  function move(x: number, y: number) {
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    setPosition({ x, y });
    const s = sound.current;
    if (!s) return;
    const t = s.ctx.currentTime;
    s.osc.frequency.setTargetAtTime(110 * 2 ** (x * 3), t, 0.03);
    s.filter.frequency.setTargetAtTime(400 + (1 - y) * 4000, t, 0.03);
    s.depth.gain.setTargetAtTime(y * 18, t, 0.03);
    s.gain.gain.setTargetAtTime(0.035, t, 0.03);
  }
  function silence() {
    const s = sound.current;
    if (s) s.gain.gain.setTargetAtTime(0, s.ctx.currentTime, 0.03);
  }
  return (
    <section>
      <p>
        A dedicated instrument, separate from the owner’s link. Left/right
        changes pitch; up/down changes tone and vibrato.
      </p>
      <div className="creative-actions">
        <button disabled={active} onClick={() => void start()}>
          Start instrument
        </button>
        <button disabled={!active} onClick={stop}>
          Stop instrument
        </button>
      </div>
      <div
        className="theremin-pad"
        tabIndex={0}
        role="application"
        aria-label="Theremin play surface. Use arrow keys or move your pointer."
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          move((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect();
          move((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        }}
        onPointerLeave={silence}
        onPointerUp={silence}
        onPointerCancel={silence}
        onBlur={silence}
        onKeyDown={(e) => {
          const dirs: Record<string, [number, number]> = {
            ArrowLeft: [-0.04, 0],
            ArrowRight: [0.04, 0],
            ArrowUp: [0, -0.04],
            ArrowDown: [0, 0.04],
          };
          const d = dirs[e.key];
          if (d) {
            e.preventDefault();
            move(position.x + d[0], position.y + d[1]);
          }
        }}
        onKeyUp={silence}
      >
        <span
          style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
        />
        <strong>{active ? "MOVE TO PLAY" : "START THE INSTRUMENT"}</strong>
      </div>
      <p role="status">
        {error ||
          (active
            ? "Instrument ready. Pointer, touch, or arrow keys."
            : "Sound off.")}
      </p>
    </section>
  );
}
