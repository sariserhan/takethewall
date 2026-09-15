"use client";

import { useEffect, useRef } from "react";
import type { LiveVisitor } from "./live-visitor-radar";

/** One arrival sound for the live radar, even when its dialog is closed. */
export function RadarArrivalSound({ visitors, connected }: {
  visitors?: LiveVisitor[];
  connected: boolean;
}) {
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const unlock = () => {
      try {
        audio.current ??= new AudioContext();
        if (audio.current.state === "suspended") {
          void audio.current.resume().catch(() => {});
        }
      } catch {
        // Some browsers do not offer Web Audio. Arrival rendering still works.
      }
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      const context = audio.current;
      audio.current = null;
      if (context) void context.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!connected || !visitors) {
      seen.current = null;
      return;
    }
    const previous = seen.current;
    seen.current = new Set(visitors.map(row => row.id));
    // Establish a silent baseline on load/reconnect; never replay existing dots.
    if (!previous || !visitors.some(row => !previous.has(row.id))) return;
    const context = audio.current;
    if (!context || context.state !== "running" ||
        document.documentElement.dataset.wallFrozen === "on") return;

    // A sharp sonar-style chirp with a metallic overtone and two fading echoes.
    // Schedule the whole ping on the audio clock, without JS animation timers.
    const now = context.currentTime;
    for (const [delay, volume] of [[0, 0.045], [0.22, 0.016], [0.44, 0.006]]) {
      for (const [frequency, level] of [[1450, 1], [2900, 0.18]]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + delay;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.78, start + 0.2);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume * level, start + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + 0.3);
      }
    }
  }, [visitors, connected]);

  return null;
}
