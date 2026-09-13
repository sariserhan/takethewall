import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  designTemplate,
  parseWallDesign,
  designUploadReferences,
} from "../lib/wall-design";
import { validateWallContent } from "../lib/content";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
const design = () => designTemplate("launch", "My project", "Try it today");
it("validates a bounded design and strips unsupported executable properties", () => {
  const d = design();
  const parsed = parseWallDesign(
    JSON.stringify({
      ...d,
      onClick: "evil",
      blocks: d.blocks.map((b) => ({
        ...b,
        style: { position: "fixed" },
        onclick: "evil",
      })),
    }),
  );
  expect(parsed).toEqual(d);
  const invalid = [
    { ...d, blocks: [{ ...d.blocks[0], href: "javascript:evil" }] },
    { ...d, blocks: [{ ...d.blocks[0], href: "https://127.0.0.1/" }] },
    { ...d, background: "url(https://other.test)" },
    { ...d, blocks: Array(9).fill(d.blocks[0]) },
    {
      ...d,
      blocks: [{ ...d.blocks[0], desktop: { x: 99, y: 0, w: 50, h: 20 } }],
    },
    { ...d, blocks: [{ ...d.blocks[0], text: "<script>bad</script>" }] },
  ];
  for (const value of invalid)
    expect(() => parseWallDesign(JSON.stringify(value))).toThrow();
  expect(() =>
    designUploadReferences([{ key: "a", uploadKey: "../other" }]),
  ).toThrow();
  expect(
    validateWallContent({
      contentType: "personal",
      websiteUrl: "",
      displayName: "Owner",
      description: "",
      canvasDesign: JSON.stringify(d),
    }).canvasDesign,
  ).toBe(JSON.stringify(d));
});
it("saves canvas assets only from owned uploads, exposes safe URLs and seals paid designs", async () => {
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  const t = convexTest(schema, modules);
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["image"])),
  );
  const houseLogo = await t.run((ctx) =>
    ctx.storage.store(new Blob(["house"])),
  );
  await t.mutation(internal.wall.seed, { logoStorageId: houseLogo });
  await t.mutation(internal.uploads.reserve, {
    key: "canvas-image",
    ownerHash: "buyer",
  });
  await t.mutation(internal.uploads.finish, { key: "canvas-image", storageId });
  const d = design();
  d.backgroundImage = "background";
  d.blocks[2].href="https://example.com/shop";
  const args = {
    requestKey: "canvas-purchase",
    fingerprint: "canvas-fingerprint",
    tokenHash: "token",
    ownerHash: "other",
    uploadKey: "",
    contentType: "personal",
    displayName: "Owner",
    websiteUrl: "",
    description: "Hello",
    buyerEmail: "owner@example.com",
    environment: "test" as const,
    canvasDesign: JSON.stringify(d),
    canvasUploads: [{ key: "background", uploadKey: "canvas-image" }],
  };
  await expect(t.mutation(internal.purchases.pending, args)).rejects.toThrow(
    "Canvas image upload expired",
  );
  const p = await t.mutation(internal.purchases.pending, {
    ...args,
    ownerHash: "buyer",
  });
  await t.mutation(internal.purchases.activate, {
    takeoverId: p.takeoverId,
    eventId: "evt_design",
    sessionId: "cs_design",
    paymentIntentId: "pi_design",
    amountCents: 499,
    currency: "usd",
    paid: true,
    livemode: false,
  });
  const wall = await t.query(api.wall.current, {});
  expect(JSON.parse(wall!.owner.canvasDesign!)).toEqual(d);
  expect(wall?.owner.canvasLinksEnabled).toBe(true);
  await t.run(ctx=>ctx.db.patch(p.takeoverId,{outboundLinkEnabled:false}));
  expect((await t.query(api.wall.current,{}))?.owner.canvasLinksEnabled).toBe(false);
  expect(wall?.owner.canvasImages).toEqual([
    { key: "background", url: expect.stringContaining("storage") },
  ]);
  expect(await t.query(api.auditTrail.verify, {})).toMatchObject({
    valid: true,
  });
  const refs = await t.run((ctx) => ctx.db.query("canvasImageRefs").collect());
  expect(refs).toHaveLength(1);
  expect(refs[0].takeoverId).toBe(p.takeoverId);
  await t.run(async (ctx) => {
    const upload = await ctx.db
      .query("uploads")
      .withIndex("by_key", (q) => q.eq("key", "canvas-image"))
      .unique();
    await ctx.db.patch(upload!._id, { expiresAt: 0 });
  });
  await t.mutation(internal.operations.cleanup, {});
  expect(await t.run(async (ctx) => !!(await ctx.storage.get(storageId)))).toBe(
    true,
  );
});

it("preserves independent block links, permits multiline messages, and requires complete URLs to publish", () => {
  const d = design();
  d.blocks[0].text = "First message\nSecond line";
  d.blocks[1].href = "https://example.com/about";
  d.blocks[2].href = "https://example.org/store";
  expect(parseWallDesign(JSON.stringify(d))?.blocks[1].href).toBe(
    "https://example.com/about",
  );
  expect(parseWallDesign(JSON.stringify(d))?.blocks[2].href).toBe(
    "https://example.org/store",
  );
  d.blocks[2].href = "https://";
  expect(parseWallDesign(JSON.stringify(d), true)?.blocks[2].href).toBe(
    "https://",
  );
  expect(() => parseWallDesign(JSON.stringify(d))).toThrow();
});
