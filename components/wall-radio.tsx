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
          type="button"
          onClick={() => void play()}
          disabled={playing || !encoded.tones.length}
        >
          Play Morse
        </button>
        <button type="button" onClick={stop} disabled={!playing}>
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
