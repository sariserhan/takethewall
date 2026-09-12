// @vitest-environment node
import { it, expect } from "vitest";
import sharp from "sharp";
import { cropRectangle, parseCrop, defaultCrop } from "../lib/image-crop";
import { processUpload } from "../lib/process-upload";
it("crop bounds stay inside the image at each shape, zoom and position", () => {
  for (const shape of ["original", "square", "landscape", "portrait"] as const)
    for (const zoom of [1, 1.5, 4])
      for (const x of [0, 50, 100])
        for (const y of [0, 50, 100]) {
          const r = cropRectangle(1600, 900, { shape, zoom, x, y });
          expect(r.left).toBeGreaterThanOrEqual(0);
          expect(r.top).toBeGreaterThanOrEqual(0);
          expect(r.left + r.width).toBeLessThanOrEqual(1600);
          expect(r.top + r.height).toBeLessThanOrEqual(900);
        }
  expect(cropRectangle(1600, 900, defaultCrop)).toEqual({
    left: 0,
    top: 0,
    width: 1600,
    height: 900,
  });
  expect(
    cropRectangle(1600, 900, { shape: "square", zoom: 1, x: 100, y: 50 }),
  ).toEqual({ left: 700, top: 0, width: 900, height: 900 });
});
it("rejects malformed crop settings instead of trusting client pixel coordinates", () => {
  for (const bad of [
    { ...defaultCrop, zoom: 0 },
    { ...defaultCrop, x: -1 },
    { ...defaultCrop, y: 101 },
    { ...defaultCrop, zoom: Infinity },
    { ...defaultCrop, shape: "__proto__" },
    null,
  ])
    expect(() => parseCrop(bad)).toThrow();
});
it("server output contains the selected pixels, has the requested shape and strips orientation", async () => {
  const width = 200,
    height = 100,
    raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = x < 100 ? 255 : 0;
      raw[i + 2] = x >= 100 ? 255 : 0;
    }
  const input = await sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
  const cropped = await processUpload(input, "image/png", {
    shape: "square",
    zoom: 1,
    x: 100,
    y: 50,
  });
  expect(await sharp(cropped).metadata()).toMatchObject({
    width: 100,
    height: 100,
    format: "webp",
  });
  const stats = await sharp(cropped).stats();
  expect(stats.channels[2].mean).toBeGreaterThan(240);
  expect(stats.channels[0].mean).toBeLessThan(15);
  const rotated = await sharp(input)
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const full = await processUpload(rotated, "image/jpeg", defaultCrop);
  const meta = await sharp(full).metadata();
  expect(meta).toMatchObject({ width: 100, height: 200 });
  expect(meta.orientation).toBeUndefined();
  await expect(processUpload(input, "image/jpeg", defaultCrop)).rejects.toThrow(
    "valid",
  );
});
