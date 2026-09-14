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
  vi.stubGlobal("window", { location: { pathname: "/" } });
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

it("never collects events on private admin or claim routes", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { wallEvent } = await import("../lib/client-events");
  for (const pathname of [
    "/admin",
    "/admin/claims",
    "/reward/claim/secret",
    "/reward/portal",
  ]) {
    vi.stubGlobal("window", { location: { pathname } });
    await wallEvent("owner", "impression");
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it("tracks browser events once per visible impression or click intent, independent of internal retries", async () => {
  const track = vi.fn();
  vi.stubGlobal("window", {
    location: { pathname: "/" },
    VisitorPing: { track },
  });
  const metadata = {
    takeoverId: "ownerA",
    ownerDomain: "example.com",
    destination: "https://example.com/",
    country: "US",
  };
  let sends = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      url === "/api/context"
        ? Response.json({
            token: "signed",
            expiresAt: Date.now() + 300000,
            visitorPing: metadata,
          })
        : new Response(null, { status: ++sends === 1 ? 503 : 204 }),
    ),
  );
  const { wallEvent } = await import("../lib/client-events");
  await wallEvent("ownerA", "impression", () => false);
  expect(track).not.toHaveBeenCalled();
  await wallEvent("ownerA", "impression", () => true);
  await wallEvent("ownerA", "impression", () => true);
  await wallEvent("ownerA", "click");
  await wallEvent("ownerA", "take_wall_clicked");
  expect(track.mock.calls.map((c) => c[0])).toEqual([
    "wall_impression",
    "wall_owner_link_click",
    "take_wall_clicked",
  ]);
  expect(track.mock.calls[0][1]).toEqual({ ...metadata, wallContext: "signed", wallEventId: expect.any(String) });
  expect(track.mock.calls[1][1]).toEqual(metadata);
  expect(track.mock.calls[2][1]).toEqual(metadata);
});
it("preserves a plain tracked ref in the signed context request and rejects ambiguous links", async () => {
  const ref = "ttw_" + "a".repeat(32);
  vi.stubGlobal("window", { location: { pathname: "/", search: "?ref=" + ref } });
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ token: "signed", expiresAt: Date.now() + 300_000 }));
  vi.stubGlobal("fetch", fetcher);
  const { context } = await import("../lib/client-events");
  await context("ownerA");
  expect(JSON.parse(fetcher.mock.calls[0][1].body).referralPublicId).toBe(ref);
  window.location.search = "?ref=" + ref + "&ref=" + ref;
  await context("ownerA");
  expect(JSON.parse(fetcher.mock.calls[1][1].body).referralPublicId).toBeUndefined();
});
