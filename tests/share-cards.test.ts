// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
import sharp from "sharp";
import { GET as badge } from "../app/takeover/[publicId]/badge/route";
import jsQR from "jsqr";
import { GET } from "../app/takeover/[publicId]/card/route";
import { getSharedTakeover } from "../lib/shared-takeover";
vi.mock("../lib/shared-takeover", () => ({ getSharedTakeover: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());
it.each([
  ["landscape", 1200, 630, false],
  ["landscape", 1200, 630, true],
  ["square", 1080, 1080, false],
  ["square", 1080, 1080, true],
  ["portrait", 1080, 1350, false],
  ["portrait", 1080, 1350, true],
] as const)(
  "%s card has correct dimensions and a decodable public QR",
  async (format, width, height, active) => {
    const id = "ttw_" + "a".repeat(32);
    vi.stubEnv("SITE_URL", "https://takethewall.com");
    vi.mocked(getSharedTakeover).mockResolvedValue({
      owner: {
        id: "fixture",
        contentType: "personal",
        linkType: "other",
        displayName: "Raven Studio",
        takeoverNumber: 16,
        outboundLinkEnabled: false,
        websiteUrl: "",
        domain: "",
        description: "A little corner of the internet.",
        logoUrl: null,
        activatedAt: 1,
        activationSequence: 1,
        impressions: 0,
        uniqueVisitors: 3840,
        clicks: 123,
        kind: "paid",
      },
      previousOwnerName: "Paper Planes",
      active,
      replacedAt: active ? null : 9900001,
      publicId: id,
    });
    const r = await GET(
      new Request(
        `https://takethewall.com/takeover/${id}/card?format=${format}&download=1`,
      ),
      { params: Promise.resolve({ publicId: id }) },
    );
    const b = await badge(
      new Request(`https://takethewall.com/takeover/${id}/badge`),
      { params: Promise.resolve({ publicId: id }) },
    );
    const svg = await b.text();
    expect(b.headers.get("content-type")).toContain("image/svg+xml");
    expect(b.headers.get("cache-control")).toContain("s-maxage=60");
    expect(svg).toContain(active ? "REIGNING NOW" : "PAST OWNER");
    expect(svg).not.toContain("Raven Studio");
    expect(svg).not.toContain("<script");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toContain(format);
    const png = Buffer.from(await r.arrayBuffer());
    expect(await sharp(png).metadata()).toMatchObject({ width, height });
    const raw = await sharp(png).ensureAlpha().raw().toBuffer();
    const decoded = jsQR(new Uint8ClampedArray(raw), width, height);
    expect(decoded?.data).toBe(
      `https://takethewall.com/takeover/${id}?via=share`,
    );
  },
);
it("removed content is not rendered and unknown formats are rejected", async () => {
  vi.mocked(getSharedTakeover).mockResolvedValue(null);
  expect(
    (
      await badge(new Request("https://takethewall.com/badge"), {
        params: Promise.resolve({ publicId: "missing" }),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await GET(new Request("https://takethewall.com/card"), {
        params: Promise.resolve({ publicId: "missing" }),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await GET(new Request("https://takethewall.com/card?format=__proto__"), {
        params: Promise.resolve({ publicId: "missing" }),
      })
    ).status,
  ).toBe(400);
});
