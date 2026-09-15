"use client";
import type { RadioChannel } from "./radio-channels";
export type RadioEffect = { channel: RadioChannel; label: string };
type Effect = "atmosphere" | "rave" | "retro" | "era";
const active = new Map<Effect, RadioEffect>();
export const radioEffectEvent = "ttw-radio-effect";
export function setRadioEffects(changes: Partial<Record<Effect, RadioEffect | null>>) {
  for (const [key, value] of Object.entries(changes)) {
    active.delete(key as Effect);
    if (value) active.set(key as Effect, value);
  }
  window.dispatchEvent(new CustomEvent(radioEffectEvent, { detail:[...active.values()].at(-1) ?? null }));
}
export function clearRadioEffects() {
  active.clear();
  window.dispatchEvent(new CustomEvent(radioEffectEvent, { detail:null }));
}
