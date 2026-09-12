// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
import sharp from "sharp";
import jsQR from "jsqr";
import { GET } from "../app/takeover/[publicId]/card/route";
import { getSharedTakeover } from "../lib/shared-takeover";
vi.mock("../lib/shared-takeover", () => ({ getSharedTakeover: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());
it.each([
  ["landscape", 1200, 630],
  ["square", 1080, 1080],
  ["portrait", 1080, 1350],
] as const)(
  "%s card has correct dimensions and a decodable public QR",
  async (format, width, height) => {
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
        uniqueVisitors: 0,
        clicks: 0,
        kind: "paid",
      },
      previousOwnerName: "Paper Planes",
      active: false,
      replacedAt: 2,
      publicId: id,
    });
    const r = await GET(
      new Request(
        `https://takethewall.com/takeover/${id}/card?format=${format}&download=1`,
      ),
      { params: Promise.resolve({ publicId: id }) },
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toContain(format);
    const png = Buffer.from(await r.arrayBuffer());
    expect(await sharp(png).metadata()).toMatchObject({ width, height });
    const raw = await sharp(png).ensureAlpha().raw().toBuffer();
    const decoded = jsQR(new Uint8ClampedArray(raw), width, height);
    expect(decoded?.data).toBe(`https://takethewall.com/takeover/${id}?via=share`);
  },
);
it("removed content is not rendered and unknown formats are rejected", async () => {
  vi.mocked(getSharedTakeover).mockResolvedValue(null);
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
