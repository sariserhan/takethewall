// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const storage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
  };
};
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("navigator", { sendBeacon: vi.fn().mockReturnValue(false) });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it("counts a displayed reign once across rerenders and reconnects and defers hidden changes", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async (url) =>
      url === "/api/context"
        ? Response.json({ token: "signed", expiresAt: Date.now() + 300_000 })
        : new Response(null, { status: 204 }),
    );
  vi.stubGlobal("fetch", fetcher);
  const { wallEvent } = await import("../lib/client-events");
  await wallEvent("ownerA", "impression", () => true);
  await wallEvent("ownerA", "impression", () => true);
  expect(fetcher.mock.calls.filter((c) => c[0] === "/api/events")).toHaveLength(
    1,
  );
  await wallEvent("ownerB", "impression", () => false);
  expect(fetcher.mock.calls.filter((c) => c[0] === "/api/events")).toHaveLength(
    1,
  );
  await wallEvent("ownerB", "impression", () => true);
  expect(fetcher.mock.calls.filter((c) => c[0] === "/api/events")).toHaveLength(
    2,
  );
});
it("keeps a stable event id for retries and unique ids for intentional clicks", async () => {
  let sent = 0;
  const fetcher = vi
    .fn()
    .mockImplementation(async (url) =>
      url === "/api/context"
        ? Response.json({ token: "signed", expiresAt: Date.now() + 300_000 })
        : new Response(null, { status: ++sent === 1 ? 503 : 204 }),
    );
  vi.stubGlobal("fetch", fetcher);
  const { wallEvent } = await import("../lib/client-events");
  await wallEvent("ownerA", "click");
  await wallEvent("ownerA", "click");
  const events = fetcher.mock.calls
    .filter((c) => c[0] === "/api/events")
    .map((c) => JSON.parse(c[1].body));
  expect(events).toHaveLength(3);
  expect(events[0].eventId).toBe(events[1].eventId);
  expect(events[2].eventId).not.toBe(events[0].eventId);
});
it("strips a confirmation token and cancellation marker before any analytics call", async () => {
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: {
      href: "https://takethewall.com/?purchase=private_token&cancelled=1",
    },
    history: { replaceState },
  });
  const { captureReturn } = await import("../lib/client-events");
  expect(captureReturn()).toEqual({ token: "private_token", cancelled: false });
  expect(replaceState).toHaveBeenCalledWith(null, "", "/");
  expect(sessionStorage.getItem("ttw-confirmation")).toBe("private_token");
});
it("does not revive an older successful purchase when a new checkout is cancelled", async () => {
  sessionStorage.setItem("ttw-confirmation", "older_success");
  vi.stubGlobal("window", {
    location: { href: "https://takethewall.com/?cancelled=1" },
    history: { replaceState: vi.fn() },
  });
  const { captureReturn } = await import("../lib/client-events");
  expect(captureReturn()).toEqual({ token: null, cancelled: true });
  expect(sessionStorage.getItem("ttw-confirmation")).toBeNull();
});
