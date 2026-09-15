"use client";

import { useEffect, useRef } from "react";
import type { LiveVisitor } from "./live-visitor-radar";

/** One arrival sound for the live radar, even when its dialog is closed. */
export function RadarArrivalSound({ visitors, connected }: {
  visitors?: LiveVisitor[];
  connected: boolean;
}) {
  const audio = useRef<AudioContext | null>(null);
  const buffer = useRef<AudioBuffer | null>(null);
  const playing = useRef<AudioBufferSourceNode | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let decoding = false;
    const download = fetch("/sounds/here39s-another-good-example.mp3", { signal: controller.signal })
      .then(response => response.ok ? response.arrayBuffer() : null)
      .catch(() => null);
    const unlock = () => {
      try {
        audio.current ??= new AudioContext();
        if (!decoding) {
          decoding = true;
          const context = audio.current;
          void download.then(async bytes => {
            if (!bytes || controller.signal.aborted) return;
            const decoded = await context.decodeAudioData(bytes);
            if (!controller.signal.aborted) buffer.current = decoded;
          }).catch(() => {});
        }
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
      controller.abort();
      buffer.current = null;
      playing.current?.stop();
      playing.current = null;
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

    // Play the supplied clip once; arrivals during playback must not stack audio.
    if (!buffer.current || playing.current) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer.current;
    gain.gain.value = 0.45;
    source.connect(gain);
    gain.connect(context.destination);
    playing.current = source;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (playing.current === source) playing.current = null;
    };
    source.start();
  }, [visitors, connected]);

  return null;
}
