"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { EffectLayer } from "./effect-layer";
import { setInteractionMode } from "./wall-interaction-mode";
const changeEvent = "ttw-blacklight-change";
function subscribe(callback: () => void) {
  window.addEventListener(changeEvent, callback);
  return () => window.removeEventListener(changeEvent, callback);
}
export function useBlacklight() {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.wallBlacklight === "on",
    () => false,
  );
}
export function setBlacklight(on: boolean) {
  if (on) setInteractionMode("off");
  document.documentElement.dataset.wallBlacklight = on ? "on" : "off";
  try {
    localStorage.setItem("ttw-blacklight", on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(changeEvent));
}
export function WallBlacklight() {
  const enabled = useBlacklight();
  const exit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    try {
      setBlacklight(localStorage.getItem("ttw-blacklight") === "on");
    } catch {}
    const stored = (event: StorageEvent) => {
      if (event.key === "ttw-blacklight") {
        document.documentElement.dataset.wallBlacklight =
          event.newValue === "on" ? "on" : "off";
        window.dispatchEvent(new Event(changeEvent));
      }
    };
    window.addEventListener("storage", stored);
    return () => window.removeEventListener("storage", stored);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    let frame = 0,
      x = innerWidth / 2,
      y = innerHeight / 2,
      keyboard = false;
    const paint = () => {
      frame = 0;
      root.style.setProperty("--blacklight-x", `${x}px`);
      root.style.setProperty("--blacklight-y", `${y}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const pointer = (event: PointerEvent) => {
      keyboard = false;
      x = event.clientX;
      y = event.clientY;
      root.style.removeProperty("--blacklight-radius");
      schedule();
    };
    const focus = () => {
      const target = document.activeElement;
      if (
        !(target instanceof HTMLElement) ||
        target === exit.current ||
        target === document.body
      )
        return;
      const rect = target.getBoundingClientRect();
      keyboard = true;
      x = Math.max(0, Math.min(innerWidth, rect.left + rect.width / 2));
      y = Math.max(0, Math.min(innerHeight, rect.top + rect.height / 2));
      root.style.setProperty(
        "--blacklight-radius",
        `${Math.min(380, Math.max(150, Math.hypot(rect.width, rect.height) / 2 + 35))}px`,
      );
      schedule();
    };
    const scroll = () => {
      if (keyboard) focus();
    };
    const resize = () => {
      x = Math.min(x, innerWidth);
      y = Math.min(y, innerHeight);
      schedule();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setBlacklight(false);
      }
    };
    paint();
    document.addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("pointerdown", pointer, { passive: true });
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", pointer);
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
      ["--blacklight-x", "--blacklight-y", "--blacklight-radius"].forEach(
        (name) => root.style.removeProperty(name),
      );
    };
  }, [enabled]);
  if (!enabled) return null;
  const light = (
    <>
      <div className="blacklight-shade" aria-hidden="true" />
      <aside className="blacklight-controls" aria-label="Blacklight controls">
        <span>
          BLACKLIGHT <small>Move, touch, or Tab to explore</small>
        </span>
        <button ref={exit} onClick={() => setBlacklight(false)}>
          Exit Blacklight <kbd>Esc</kbd>
        </button>
      </aside>
    </>
  );
  return <EffectLayer>{light}</EffectLayer>;
}
