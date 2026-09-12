import { processUpload } from "@/lib/process-upload";
import { parseCrop } from "@/lib/image-crop";
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
    const cropValue = form.get("crop");
    const crop =
      typeof cropValue === "string"
        ? parseCrop(JSON.parse(cropValue))
        : undefined;
    const image = await processUpload(raw, file.type, crop);
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
