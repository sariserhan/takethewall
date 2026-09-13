"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
export function MobilePurchaseBar({
  target,
  onTake,
  paused,
}: {
  target: RefObject<HTMLButtonElement | null>;
  onTake: () => void;
  paused: boolean;
}) {
  const [visible, setVisible] = useState(true),
    [modal, setModal] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) =>
      setVisible(entries[0]?.isIntersecting ?? true),
    );
    if (target.current) observer.observe(target.current);
    const update = () => setModal(!!document.querySelector("dialog[open]"));
    const dialogs = new MutationObserver(update);
    dialogs.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    update();
    return () => {
      observer.disconnect();
      dialogs.disconnect();
    };
  }, [target]);
  if (visible || modal || paused) return null;
  return (
    <aside className="mobile-purchase-bar" aria-label="Quick takeover">
      <button className="button primary" onClick={onTake}>
        TAKE THE WALL — $4.99 ↗
      </button>
      <small>USD plus applicable tax</small>
    </aside>
  );
}
export function TakeoverSound({ changed }: { changed: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const context = useRef<AudioContext | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Read the saved browser preference after hydration.
      setEnabled(localStorage.getItem("ttw-sound") === "on");
    } catch {}
    return () => {
      void context.current?.close();
      context.current = null;
    };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      try {
        context.current ??= new AudioContext();
        void context.current.resume().catch(() => {});
      } catch {}
    };
    document.addEventListener("pointerdown", unlock);
    return () => document.removeEventListener("pointerdown", unlock);
  }, [enabled]);
  useEffect(() => {
    const audio = context.current;
    if (
      !changed ||
      !enabled ||
      !audio ||
      audio.state !== "running" ||
      document.visibilityState !== "visible"
    )
      return;
    const oscillator = audio.createOscillator(),
      gain = audio.createGain(),
      now = audio.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(440, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.22);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }, [changed, enabled]);
  return (
    <button
      className="sound-toggle"
      aria-pressed={enabled}
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        try {
          localStorage.setItem("ttw-sound", next ? "on" : "off");
        } catch {}
        if (next) {
          try {
            context.current ??= new AudioContext();
            void context.current.resume().catch(() => {});
          } catch {}
        }
      }}
    >
      Sound {enabled ? "on" : "off"}
    </button>
  );
}
