"use client";
import { useSyncExternalStore } from "react";
const event = "ttw-sound-change";
let fallback = true;
export function wallSoundEnabled() {
  try { return localStorage.getItem("ttw-sound") !== "off"; } catch { return fallback; }
}
export function setWallSound(enabled: boolean) {
  fallback = enabled;
  try { localStorage.setItem("ttw-sound", enabled ? "on" : "off"); } catch {}
  window.dispatchEvent(new Event(event));
}
function subscribe(callback: () => void) {
  const stored = (e: StorageEvent) => { if (e.key === "ttw-sound" || e.key === null) callback(); };
  window.addEventListener(event, callback);
  window.addEventListener("storage", stored);
  return () => { window.removeEventListener(event, callback); window.removeEventListener("storage", stored); };
}
export function useWallSound() { return useSyncExternalStore(subscribe, wallSoundEnabled, () => true); }
