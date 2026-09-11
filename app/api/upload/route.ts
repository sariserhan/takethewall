import sharp from "sharp";
import {
  backend,
  boundedBody,
  clientHash,
  failure,
  HttpError,
  randomToken,
  sameOrigin,
} from "@/lib/server";
import { validateFile, MAX_IMAGE_BYTES } from "@/lib/validation";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (
      Number(req.headers.get("content-length") ?? 0) >
      MAX_IMAGE_BYTES + 32_768
    )
      throw new HttpError("Image is too large", 413);
    const key = randomToken();
    await backend("reserveUpload", { key, ownerHash: clientHash(req) });
    const bytes = await boundedBody(req, MAX_IMAGE_BYTES + 32_768);
    const form = await new Response(bytes, {
      headers: { "Content-Type": req.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("logo");
    if (!(file instanceof File)) throw new HttpError("Choose a logo");
    validateFile(file);
    const raw = Buffer.from(await file.arrayBuffer());
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
    const mime = mimes[meta.format ?? ""];
    if (mime !== file.type || (meta.pages ?? 1) > 1)
      throw new HttpError("Choose a valid, non-animated PNG, JPEG, or WEBP.");
    const image = await input
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    if (image.length > MAX_IMAGE_BYTES)
      throw new HttpError("Image is too large");
    const uploaded = await backend<{ logoUrl: string }>("upload", {
      key,
      base64: image.toString("base64"),
    });
    return Response.json(
      { uploadKey: key, logoUrl: uploaded.logoUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
