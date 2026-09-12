import sharp from "sharp";
import { cropRectangle, type CropOptions } from "./image-crop";
import { MAX_IMAGE_BYTES } from "./validation";
export async function processUpload(
  raw: Buffer,
  mime: string,
  crop?: CropOptions,
) {
  const input = sharp(raw, {
    limitInputPixels: 16_000_000,
    animated: false,
    failOn: "warning",
  });
  const meta = await input.metadata();
  const mimes: Record<string, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  if (mimes[meta.format ?? ""] !== mime || (meta.pages ?? 1) > 1)
    throw new Error("Choose a valid, non-animated PNG, JPEG, or WEBP.");
  // Apply EXIF orientation before computing a pixel crop; preview and output agree.
  const oriented = await input.rotate().toBuffer({ resolveWithObject: true });
  let pipeline = sharp(oriented.data, { limitInputPixels: 16_000_000 });
  if (crop)
    pipeline = pipeline.extract(
      cropRectangle(oriented.info.width, oriented.info.height, crop),
    );
  const image = await pipeline
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  if (image.length > MAX_IMAGE_BYTES) throw new Error("Image is too large");
  return image;
}
