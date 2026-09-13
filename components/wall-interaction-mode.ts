"use client";
import { useSyncExternalStore } from "react";
export type InteractionMode = "off" | "thermal" | "theremin";
export const interactionEvent = "ttw-interaction-change";
export function setInteractionMode(mode: InteractionMode) {
  document.documentElement.dataset.wallInteraction = mode;
  try {
    localStorage.setItem("ttw-interaction", mode);
  } catch {}
  if (mode !== "off") {
    document.documentElement.dataset.wallBlacklight = "off";
    try {
      localStorage.setItem("ttw-blacklight", "off");
    } catch {}
    window.dispatchEvent(new Event("ttw-blacklight-change"));
  }
  window.dispatchEvent(new Event(interactionEvent));
}
function subscribe(callback: () => void) {
  window.addEventListener(interactionEvent, callback);
  return () => window.removeEventListener(interactionEvent, callback);
}
export function useInteractionMode(): InteractionMode {
  return useSyncExternalStore(
    subscribe,
    () => {
      const value = document.documentElement.dataset.wallInteraction;
      return value === "thermal" || value === "theremin" ? value : "off";
    },
    () => "off",
  );
}
