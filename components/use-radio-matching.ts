"use client";
import { useSyncExternalStore } from "react";
export const radioMatchingEvent = "ttw-radio-matching-change";
let fallback = true;
export function radioMatchingEnabled() {
  try { return localStorage.getItem("ttw-radio-match") !== "off"; } catch { return fallback; }
}
export function setRadioMatching(enabled: boolean) {
  fallback = enabled;
  try { localStorage.setItem("ttw-radio-match", enabled ? "on" : "off"); } catch {}
  window.dispatchEvent(new Event(radioMatchingEvent));
}
function subscribe(callback: () => void) {
  const stored = (event: StorageEvent) => { if (event.key === "ttw-radio-match" || event.key === null) callback(); };
  window.addEventListener(radioMatchingEvent, callback);
  window.addEventListener("storage", stored);
  return () => { window.removeEventListener(radioMatchingEvent, callback); window.removeEventListener("storage", stored); };
}
export function useRadioMatching() { return useSyncExternalStore(subscribe, radioMatchingEnabled, () => true); }
