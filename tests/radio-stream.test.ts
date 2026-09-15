// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "@/app/api/radio/[channel]/route";
const context = (channel = "lofi") => ({ params: Promise.resolve({ channel }) });
beforeEach(() => {
  vi.stubEnv("R2_ACCOUNT_ID", "test-account");
  vi.stubEnv("R2_ACCESS_KEY_ID", "test-access");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret");
  vi.stubEnv("R2_BUCKET", "test-library");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("radio stream", () => {
  it("only serves approved channels", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await GET(new Request("https://wall.test/api/radio/private"), context("private"))).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects multi-range requests before accessing the library", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const result = await GET(new Request("https://wall.test/api/radio/lofi", { headers:{Range:"bytes=0-10,20-30"} }), context());
    expect(result.status).toBe(416); expect(fetcher).not.toHaveBeenCalled();
  });
  it("streams partial content without exposing credentials or provider headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2,3]), { status:206, headers:{"Content-Range":"bytes 0-2/100", "Content-Length":"3", "x-amz-request-id":"private-id"} }));
    vi.stubGlobal("fetch", fetcher);
    const result = await GET(new Request("https://wall.test/api/radio/lofi", {headers:{Range:"bytes=0-2"}}), context());
    expect(result.status).toBe(206); expect(result.headers.get("content-range")).toBe("bytes 0-2/100");
    expect(result.headers.get("content-type")).toBe("audio/mpeg"); expect(result.headers.get("x-amz-request-id")).toBeNull();
    expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([1,2,3]);
    const options = fetcher.mock.calls[0][1];
    expect(options.headers.Range).toBe("bytes=0-2"); expect(options.headers.Authorization).toContain("AWS4-HMAC-SHA256");
    expect(JSON.stringify([...result.headers])).not.toContain("test-access");
  });
  it("supports metadata requests without an audio response body", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {headers:{"Content-Length":"100"}})); vi.stubGlobal("fetch", fetcher);
    const result = await HEAD(new Request("https://wall.test/api/radio/lofi", {method:"HEAD"}), context());
    expect(fetcher.mock.calls[0][1].method).toBe("HEAD"); expect(result.body).toBeNull(); expect(result.headers.get("content-length")).toBe("100");
  });
  it("does not relay private upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private account details", {status:403})));
    const result = await GET(new Request("https://wall.test/api/radio/lofi"), context());
    expect(result.status).toBe(502); expect(await result.text()).toBe("This channel is temporarily unavailable.");
  });
  it("handles missing credentials without requesting audio", async () => {
    vi.stubEnv("R2_SECRET_ACCESS_KEY", ""); const fetcher=vi.fn(); vi.stubGlobal("fetch",fetcher);
    expect((await GET(new Request("https://wall.test/api/radio/lofi"), context())).status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
});
