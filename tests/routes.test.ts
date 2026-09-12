// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { boundedBody } from "../lib/server";
import { POST as upload } from "../app/api/upload/route";
import { POST as checkout } from "../app/api/checkout/route";
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
}));
const { create, retrieve } = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
}));
vi.mock("../lib/stripe", async (original) => {
  const actual = await original<typeof import("../lib/stripe")>();
  return {
    ...actual,
    getStripe: () => ({
      checkout: { sessions: { create } },
      prices: { retrieve },
    }),
  };
});
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://takethewall.com");
  vi.stubEnv("WALL_TOKEN_SECRET", "x".repeat(40));
  vi.stubEnv("WALL_SERVER_SECRET", "x".repeat(40));
  vi.stubEnv("CONVEX_HTTP_URL", "https://local.convex.site");
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_example");
  create.mockReset();
  retrieve.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function req(path: string, body: BodyInit, contentType?: string) {
  return new Request("https://takethewall.com/api/" + path, {
    method: "POST",
    headers: {
      origin: "https://takethewall.com",
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
  });
}
describe("real route boundaries", () => {
  it("bounds streaming bodies even without Content-Length", async () => {
    await expect(boundedBody(req("test", "abcdef"), 3)).rejects.toThrow(
      "too large",
    );
    expect(
      new TextDecoder().decode(await boundedBody(req("test", "abc"), 3)),
    ).toBe("abc");
  });
  it("rejects mismatched origins before any backend request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const r = await upload(
      new Request("https://takethewall.com/api/upload", {
        method: "POST",
        body: "bad",
        headers: { origin: "https://evil.com" },
      }),
    );
    expect(r.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects counterfeit image bytes after upload authorization", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(null));
    vi.stubGlobal("fetch", fetcher);
    const data = new FormData();
    data.set(
      "logo",
      new File(["<svg><script/></svg>"], "logo.png", { type: "image/png" }),
    );
    expect((await upload(req("upload", data))).status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("decodes and normalizes images before storage", async () => {
    const fetcher = vi.fn().mockImplementation(async (_url, init) => {
      const { op, args } = JSON.parse(init.body);
      if (op === "upload") {
        const metadata = await sharp(
          Buffer.from(args.base64, "base64"),
        ).metadata();
        expect(metadata.format).toBe("webp");
        expect(metadata.width).toBeLessThanOrEqual(512);
        return Response.json({ logoUrl: "https://storage.convex.cloud/logo" });
      }
      return Response.json(null);
    });
    vi.stubGlobal("fetch", fetcher);
    const data = new FormData();
    const png = await sharp({
      create: { width: 1000, height: 500, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    data.set(
      "logo",
      new File([new Uint8Array(png)], "logo.png", { type: "image/png" }),
    );
    expect((await upload(req("upload", data))).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("creates Stripe checkout with fixed price, private email, and stable idempotency", async () => {
    const fetcher = vi.fn().mockImplementation(async (_url, init) => {
      const { op } = JSON.parse(init.body);
      return Response.json(
        op === "pending"
          ? {
              takeoverId: "takeover123",
              purchaseId: "purchase123",
              checkoutUrl: null,
              checkoutExpiresAt: Date.now() + 86400_000,
            }
          : null,
      );
    });
    vi.stubGlobal("fetch", fetcher);
    create.mockResolvedValue({
      id: "cs_test_1",
      url: null,
      client_secret: "cs_test_1_secret_example",
    });
    const data = {
      websiteUrl: "https://example.com",
      description: "Hello",
      buyerEmail: "Buyer+1@example.com",
      requestKey: "a".repeat(32),
      uploadKey: "b".repeat(32),
      amount: 1,
    };
    const response = await checkout(
      req("checkout", JSON.stringify(data), "application/json"),
    );
    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_email: "Buyer+1@example.com",
        mode: "payment",
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              unit_amount: 399,
              currency: "usd",
            }),
          }),
        ],
      }),
      { idempotencyKey: "takeover:purchase123" },
    );
    const params = create.mock.calls[0][0];
    expect(params.return_url).not.toContain(data.buyerEmail);
    expect(params.ui_mode).toBe("embedded_page");
    expect(params.success_url).toBeUndefined();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      clientSecret: "cs_test_1_secret_example",
      publishableKey: "pk_test_example",
    });
    expect(params.metadata).not.toHaveProperty("email");
  });
});
