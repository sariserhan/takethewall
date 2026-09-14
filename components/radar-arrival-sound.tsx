"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/** Keep the arrival subscription alive independently of the Radar dialog. */
export function RadarArrivalSound() {
  const arrivals = useQuery(api.visitorPingWebhook.radar, {});
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
    if (!arrivals) return;
    const previous = seen.current;
    seen.current = new Set(arrivals.map(row => row.id));
    // The first snapshot is history, not a new arrival. Never replay it.
    if (!previous) return;
    const now = Date.now();
    const fresh = arrivals.some(row =>
      !previous.has(row.id) && now >= row.receivedAt && now - row.receivedAt < 15_000,
    );
    const context = audio.current;
    if (!fresh || !context || context.state !== "running" ||
        document.documentElement.dataset.wallFrozen === "on") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  }, [arrivals]);

  return null;
}
