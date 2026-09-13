import {
  backend,
  failure,
  HttpError,
  jsonBody,
  rate,
  sameOrigin,
} from "@/lib/server";
import { sitePulse, type PulseResult } from "@/lib/site-pulse";
export const runtime = "nodejs";
let cached:
  | { id: string; url: string; expires: number; result: Promise<PulseResult> }
  | undefined;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "pulse", 6);
    const args = await jsonBody(req);
    if (typeof args.takeoverId !== "string" || args.takeoverId.length > 100)
      throw new HttpError("Choose the current wall.");
    const owner = await backend<{ id: string; websiteUrl: string }>("context", {
      takeoverId: args.takeoverId,
    });
    if (!owner.websiteUrl)
      throw new HttpError("This placement has no website to check.");
    if (
      !cached ||
      cached.id !== owner.id ||
      cached.url !== owner.websiteUrl ||
      cached.expires < Date.now()
    ) {
      await backend("rate", {
        key: "pulse-owner:" + owner.id,
        max: 6,
        windowMs: 60_000,
      });
      cached = {
        id: owner.id,
        url: owner.websiteUrl,
        expires: Date.now() + 60_000,
        result: sitePulse(owner.websiteUrl),
      };
    }
    return Response.json(await cached.result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
