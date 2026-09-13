import { afterEach, expect, it, vi } from "vitest";
import { livePreviewOwner } from "../lib/live-preview-owner";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses the real public owner and ignores demo presentation", async () => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          value: {
            owner: {
              kind: "paid",
              displayName: "Real owner",
              takeoverNumber: 16,
            },
            demoPresentation: { displayName: "Fake owner" },
          },
        }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(await livePreviewOwner()).toEqual({
    displayName: "Real owner",
    takeoverNumber: 16,
  });
  expect(fetcher.mock.calls[0][1].cache).toBe("no-store");
});
it("falls back during an outage or before an owner exists", async () => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  expect(await livePreviewOwner()).toBeNull();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "success", value: null })),
      ),
  );
  expect(await livePreviewOwner()).toBeNull();
});
