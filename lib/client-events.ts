export type WallEvent =
  "impression" | "click" | "take_wall_clicked" | "checkout_started";
let visitorId: string, pageId: string;
const contexts = new Map<string, { token: string; expiresAt: number }>();
const requests = new Map<
  string,
  Promise<{ token: string; expiresAt: number }>
>();
const impressions = new Set<string>();
export function browserIdentity() {
  if (!pageId) pageId = crypto.randomUUID();
  if (!visitorId) {
    try {
      visitorId = localStorage.getItem("ttw-visitor-v1") ?? crypto.randomUUID();
      localStorage.setItem("ttw-visitor-v1", visitorId);
    } catch {
      visitorId = crypto.randomUUID();
    }
  }
  return { visitorId, pageId };
}
async function context(takeoverId: string) {
  const old = contexts.get(takeoverId);
  if (old && old.expiresAt > Date.now() + 5000) return old;
  const inflight = requests.get(takeoverId);
  if (inflight) return inflight;
  const task = fetch("/api/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ takeoverId, ...browserIdentity() }),
  })
    .then(async (r) => {
      if (!r.ok) throw new Error("Context unavailable");
      const result = await r.json();
      contexts.set(takeoverId, result);
      return result;
    })
    .finally(() => requests.delete(takeoverId));
  requests.set(takeoverId, task);
  return task;
}
export async function wallEvent(
  takeoverId: string,
  event: WallEvent,
  isVisible?: () => boolean,
) {
  if (event === "impression" && impressions.has(takeoverId)) return;
  if (event === "impression") impressions.add(takeoverId);
  const eventId = crypto.randomUUID();
  try {
    const c = await context(takeoverId);
    if (event === "impression" && isVisible && !isVisible()) {
      impressions.delete(takeoverId);
      return;
    }
    const body = JSON.stringify({ token: c.token, eventId, event });
    if (event === "click" && navigator.sendBeacon) {
      const accepted = navigator.sendBeacon(
        "/api/events",
        new Blob([body], { type: "application/json" }),
      );
      if (accepted) return;
    }
    const send = () =>
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    const response = await send();
    if (response.status >= 500) {
      const retry = await send();
      if (!retry.ok && event === "impression") impressions.delete(takeoverId);
    } else if (!response.ok && event === "impression")
      impressions.delete(takeoverId);
  } catch {
    if (event === "impression")
      impressions.delete(
        takeoverId,
      ); /* Analytics never interrupts navigation or Checkout. */
  }
}
export function captureReturn() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("purchase");
  const cancelled = url.searchParams.has("cancelled") && !token;
  if (token || cancelled) window.history.replaceState(null, "", url.pathname);
  let saved = token;
  try {
    if (cancelled) sessionStorage.removeItem("ttw-confirmation");
    else if (token) sessionStorage.setItem("ttw-confirmation", token);
    else saved = sessionStorage.getItem("ttw-confirmation");
  } catch {}
  return { token: saved, cancelled };
}
