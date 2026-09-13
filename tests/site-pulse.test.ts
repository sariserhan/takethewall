// @vitest-environment node
import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));
import { sitePulse } from "../lib/site-pulse";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});
it.each([
  "http://public.com",
  "https://127.0.0.1",
  "https://user:pass@public.com",
  "https://public.com:8443",
])("does not request unsafe URL %s", async (url) => {
  expect((await sitePulse(url)).outcome).toBe("unconfirmed");
  expect(mocks.request).not.toHaveBeenCalled();
});
it("rejects DNS answers containing a private IP", async () => {
  mocks.lookup.mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ]);
  expect((await sitePulse("https://public.com")).outcome).toBe("unconfirmed");
  expect(mocks.request).not.toHaveBeenCalled();
});
it.each([200, 302, 403, 405, 503])(
  "reports HTTP %i without following redirects or claiming downtime",
  async (status) => {
    mocks.request.mockImplementation((_url, options, callback) => {
      expect(options.method).toBe("HEAD");
      expect(options.rejectUnauthorized).toBe(true);
      expect(options.family).toBe(4);
      const pinned = vi.fn();
      options.lookup("public.com", {}, pinned);
      expect(pinned).toHaveBeenCalledWith(null, "93.184.216.34", 4);
      const req = Object.assign(new EventEmitter(), {
        end: () => callback({ statusCode: status, destroy: () => {} }),
        destroy: () => {
          req.emit("close");
          return req;
        },
      });
      return req;
    });
    const result = await sitePulse("https://public.com");
    expect(result).toMatchObject({
      outcome: "responded",
      status,
      tlsVerified: true,
    });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  },
);
it("treats TLS/connection errors as inconclusive", async () => {
  mocks.request.mockImplementation(() => {
    const req = Object.assign(new EventEmitter(), {
      end: () => {
        req.emit("error", new Error("certificate rejected"));
        req.emit("close");
      },
      destroy: () => req,
    });
    return req;
  });
  expect(await sitePulse("https://public.com")).toMatchObject({
    outcome: "unconfirmed",
    status: null,
    tlsVerified: false,
  });
});
