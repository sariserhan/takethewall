import { createHash, createHmac } from "node:crypto";
import { radioChannels } from "@/lib/radio-channels";

export const runtime = "nodejs";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const hmac = (key: Buffer | string, text: string) => createHmac("sha256", key).update(text).digest();

async function stream(request: Request, channel: string, method: "GET" | "HEAD") {
  if (!radioChannels.some(value => value === channel)) return new Response(null, { status:404 });
  const account = process.env.R2_ACCOUNT_ID;
  const access = process.env.R2_ACCESS_KEY_ID;
  const secret = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!account || !access || !secret || !bucket) return new Response("Radio is temporarily unavailable.", { status:503 });
  const range = request.headers.get("range");
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return new Response(null, { status:416 });
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${encodeURIComponent(bucket)}/${channel}/${channel}.mp3`;
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = timestamp.slice(0, 8);
  const bodyHash = hash("");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const headers = `host:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${timestamp}\n`;
  const canonical = [method, path, "", headers, signedHeaders, bodyHash].join("\n");
  const scope = `${date}/auto/s3/aws4_request`;
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, date), "auto"), "s3"), "aws4_request");
  const signature = hmac(key, `AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`).toString("hex");
  const upstreamHeaders: Record<string, string> = {
    Authorization: `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": bodyHash,
    "x-amz-date": timestamp,
  };
  if (range) upstreamHeaders.Range = range;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await fetch(`https://${host}${path}`, {
      method, headers:upstreamHeaders, cache:"no-store",
      signal:AbortSignal.any([request.signal, controller.signal]),
    });
    clearTimeout(timeout);
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return new Response("This channel is temporarily unavailable.", { status:upstream.status === 416 ? 416 : 502 });
    }
    const responseHeaders = new Headers({
      "Content-Type":"audio/mpeg", "Accept-Ranges":"bytes",
      "Cache-Control":"public, max-age=3600", "X-Content-Type-Options":"nosniff",
    });
    for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(method === "HEAD" ? null : upstream.body, { status:upstream.status, headers:responseHeaders });
  } catch {
    return new Response("Radio is temporarily unavailable.", { status:502 });
  } finally { clearTimeout(timeout); }
}
export async function GET(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  return stream(request, (await params).channel, "GET");
}
export async function HEAD(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  return stream(request, (await params).channel, "HEAD");
}
