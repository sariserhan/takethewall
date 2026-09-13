"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** The inert copy freezes every displayed query and timer together. React keeps
 * the original tree mounted and subscribed so thaw restores the latest state. */
export function WallFreeze({ name }: { name?: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const thawButton = useRef<HTMLButtonElement>(null);
  const snapshot = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [frozen, setFrozen] = useState<{
    at: number;
    name: string;
    metrics: string;
  } | null>(null);
  const [thawing, setThawing] = useState(false);
  const [error, setError] = useState("");

  const sound = useCallback((thaw: boolean) => {
    try {
      if (localStorage.getItem("ttw-sound") !== "on") return;
      void audio.current?.close().catch(() => {});
      const ctx = new AudioContext();
      audio.current = ctx;
      const buffer = ctx.createBuffer(
        1,
        Math.floor(ctx.sampleRate * 0.4),
        ctx.sampleRate,
      );
      const values = buffer.getChannelData(0);
      for (let i = 0; i < values.length; i++)
        values[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / values.length, 3);
      const source = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      source.buffer = buffer;
      filter.type = "highpass";
      filter.frequency.value = thaw ? 1200 : 2400;
      gain.gain.value = 0.055;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      void ctx
        .resume()
        .then(() => source.start())
        .catch(() => {
          void ctx.close().catch(() => {});
        });
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
        void ctx.close().catch(() => {});
        if (audio.current === ctx) audio.current = null;
      };
    } catch {
      /* Browsers without audio still get the visual effect. */
    }
  }, []);

  const thaw = useCallback(() => {
    if (!snapshot.current) return;
    const scrollY = window.scrollY;
    snapshot.current.remove();
    snapshot.current = null;
    delete document.documentElement.dataset.wallFrozen;
    document.documentElement.dataset.wallThawing = "on";
    setFrozen(null);
    setThawing(true);
    sound(true);
    window.scrollTo({ top: scrollY, behavior: "instant" });
    trigger.current?.focus({ preventScroll: true });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      delete document.documentElement.dataset.wallThawing;
      setThawing(false);
    }, 650);
  }, [sound]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && snapshot.current) {
        event.preventDefault();
        thaw();
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      snapshot.current?.remove();
      snapshot.current = null;
      delete document.documentElement.dataset.wallFrozen;
      delete document.documentElement.dataset.wallThawing;
      if (timer.current) clearTimeout(timer.current);
      void audio.current?.close().catch(() => {});
    };
  }, [thaw]);
  useEffect(() => {
    if (frozen) thawButton.current?.focus({ preventScroll: true });
  }, [frozen]);

  function freeze() {
    const source = trigger.current?.closest<HTMLElement>(".wall-page");
    if (!source || snapshot.current) return;
    try {
      setError("");
      if (timer.current) clearTimeout(timer.current);
      delete document.documentElement.dataset.wallThawing;
      setThawing(false);
      const copy = source.cloneNode(true) as HTMLElement;
      copy.classList.add("cryo-snapshot");
      copy.inert = true;
      copy.setAttribute("aria-hidden", "true");
      // Copies are presentation only: no duplicate IDs, active dialogs or media.
      copy
        .querySelectorAll("[id]")
        .forEach((node) => node.removeAttribute("id"));
      copy
        .querySelectorAll("dialog,iframe,video,audio,script")
        .forEach((node) => node.remove());
      copy.querySelectorAll(".connection").forEach((node) => {
        node.textContent = "FROZEN";
      });
      const scrollY = window.scrollY;
      source.after(copy);
      snapshot.current = copy;
      document.documentElement.dataset.wallFrozen = "on";
      setFrozen({
        at: Date.now(),
        name: name ?? "The wall",
        metrics: source.querySelector(".site-metrics")?.textContent ?? "",
      });
      window.scrollTo({ top: scrollY, behavior: "instant" });
      sound(false);
    } catch {
      snapshot.current?.remove();
      snapshot.current = null;
      delete document.documentElement.dataset.wallFrozen;
      setError("Could not freeze the view. The wall is still live.");
    }
  }
  return (
    <>
      <button ref={trigger} className="wall-action" onClick={freeze}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4M20 14l-4 1 1 4M4 14l4 1-1 4M20 10l-4-1 1-4" />
        </svg>
        Freeze
      </button>
      {error && <p role="status">{error}</p>}
      {(frozen || thawing) &&
        createPortal(
          <div className={`cryo-layer${thawing ? " thawing" : ""}`}>
            <div className="cryo-ice" aria-hidden="true">
              <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
                <path d="M0 0 130 70 100 160 210 230M130 70 230 40M100 160 35 230M1000 0 870 70 900 160 790 230M870 70 770 40M900 160 965 230M0 1000 130 930 100 840 210 770M130 930 230 960M100 840 35 770M1000 1000 870 930 900 840 790 770M870 930 770 960M900 840 965 770M0 480 75 450 100 510 170 485M75 450 120 370M1000 480 925 450 900 510 830 485M925 450 880 370" />
              </svg>
            </div>
            {frozen ? (
              <section
                className="cryo-controls"
                role="dialog"
                aria-modal="true"
                aria-label="Frozen wall view"
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    thawButton.current?.focus();
                  }
                }}
              >
                <strong>TIME FROZEN</strong>
                <p>
                  {frozen.name} ·{" "}
                  {new Date(frozen.at).toISOString().slice(11, 19)} UTC
                </p>
                <p className="sr-only">{frozen.metrics}</p>
                <p>
                  Your view is paused. The live wall keeps running. Thaw to
                  interact again.
                </p>
                <button ref={thawButton} onClick={thaw}>
                  Thaw — return to live
                </button>
                <small>Esc also thaws the wall.</small>
              </section>
            ) : (
              <p className="cryo-live" role="status">
                Caught up with the live wall
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
