export interface VisitorPingProperties {
  takeoverId: string;
  ownerDomain: string;
  destination: string;
  country?: string;
}
type Event =
  | "wall_impression"
  | "wall_owner_link_click"
  | "take_wall_clicked"
  | "takeover_activated"
  | "checkout_started"
  | "checkout_completed";
declare global {
  interface Window {
    VisitorPing?: {
      track: (event: string, data?: Record<string, unknown>) => void;
    };
  }
}
const once = new Set<string>();
const pending: {
  event: Event;
  data: VisitorPingProperties;
  expires: number;
  key?: string;
  persist?: boolean;
}[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
function flush() {
  timer = undefined;
  for (let i = 0; i < pending.length;) {
    const item = pending[i];
    if (window.location.pathname !== "/" || Date.now() >= item.expires) {
      pending.splice(i, 1);
      if (item.key) once.delete(item.key);
      continue;
    }
    if (!window.VisitorPing?.track) break;
    pending.splice(i, 1);
    try {
      window.VisitorPing?.track(item.event, { ...item.data });
      if (item.persist && item.key)
        try {
          sessionStorage.setItem("ttw-vp:" + item.key, "1");
        } catch {}
    } catch {
      /* A tracker failure must not interrupt navigation or checkout. */
    }
  }
  if (pending.length) timer = setTimeout(flush, 250);
}
export function trackVisitorPing(
  event: Event,
  data: VisitorPingProperties,
  options: { once?: boolean; persist?: boolean } = {},
) {
  if (typeof window === "undefined" || window.location.pathname !== "/") return;
  const key = options.once ? event + ":" + data.takeoverId : undefined;
  if (key) {
    if (once.has(key)) return;
    try {
      if (options.persist && sessionStorage.getItem("ttw-vp:" + key)) return;
    } catch {}
    once.add(key);
  }
  if (pending.length >= 50) {
    if (key) once.delete(key);
    return;
  }
  pending.push({
    event,
    data,
    expires: Date.now() + 15_000,
    key,
    persist: options.persist,
  });
  if (timer) clearTimeout(timer);
  flush();
}
export function trackVerifiedTakeover(
  data: VisitorPingProperties | null | undefined,
) {
  if (!data) return;
  trackVisitorPing("checkout_completed", data, { once: true, persist: true });
  trackVisitorPing("takeover_activated", data, { once: true, persist: true });
}
