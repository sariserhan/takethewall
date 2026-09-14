import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { excludedTraffic, validateUrl } from "./validation";
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function env(name: string) {
  const value = process.env[name];
  if (!value)
    throw new HttpError(
      "The wall is temporarily unavailable. Please try again later.",
      503,
    );
  return value;
}
export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function keyed(value: string) {
  const secret = env("WALL_TOKEN_SECRET");
  if (secret.length < 32)
    throw new HttpError("Server configuration unavailable", 503);
  return createHmac("sha256", secret).update(value).digest("hex");
}
export const randomToken = () => randomBytes(32).toString("base64url");
export function statusToken(requestKey: string) {
  return createHmac("sha256", env("WALL_TOKEN_SECRET"))
    .update("confirmation:" + requestKey)
    .digest("base64url");
}
export async function backend<T>(op: string, args: unknown): Promise<T> {
  const url =
    process.env.CONVEX_HTTP_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!url)
    throw new HttpError(
      "The wall is temporarily unavailable. Please try again later.",
      503,
    );
  const response = await fetch(url + "/server", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("WALL_SERVER_SECRET")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ op, args }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new HttpError(
      response.status === 429
        ? "Too many requests. Try again later."
        : "Could not complete this request. Please try again.",
      response.status === 429 ? 429 : 503,
    );
  return response.json();
}
export function sameOrigin(req: Request) {
  const target = new URL(req.url);
  const localHosts = ["localhost", "127.0.0.1", "[::1]"];
  const loopback = localHosts.includes(target.hostname);
  // Next or local port forwarding can normalize the request URL hostname
  // and port. A loopback Host preserves the browser-facing origin. Requiring
  // Origin to match it exactly still rejects requests from other local ports.
  const host = req.headers.get("host");
  let localOrigin = target.origin;
  if (loopback && host) {
    try {
      const incoming = new URL(`${target.protocol}//${host}`);
      if (incoming.host === host && localHosts.includes(incoming.hostname))
        localOrigin = incoming.origin;
    } catch {
      /* Invalid Host cannot expand the allowed origin. */
    }
  }
  // Local Next servers may use any port, including a production build run
  // locally. Match that exact origin, never a different localhost port.
  // Vercel and public hosts keep the configured canonical-origin boundary.
  const expected =
    process.env.VERCEL !== "1" && loopback
      ? localOrigin
      : new URL(
          process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000",
        ).origin;
  if (req.headers.get("origin") !== expected)
    throw new HttpError("Invalid request origin", 403);
}
export function clientHash(req: Request) {
  const ip =
    process.env.VERCEL === "1"
      ? req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
      : null;
  return keyed("ip:" + (ip ?? "local"));
}
export async function rate(
  req: Request,
  scope: string,
  max: number,
  windowMs = 60_000,
) {
  await backend("rate", { key: scope + ":" + clientHash(req), max, windowMs });
}
export async function boundedBody(req: Request, max: number) {
  if (Number(req.headers.get("content-length") ?? 0) > max)
    throw new HttpError("Request too large", 413);
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new HttpError("Request too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result;
}
export async function jsonBody(req: Request, max = 16_384) {
  const bytes = await boundedBody(req, max);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError("Invalid request");
  }
}
export function failure(error: unknown) {
  if (error instanceof HttpError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(
    { error: "Could not complete this request. Please try again." },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
export async function publicDestination(value: string) {
  const result = validateUrl(value);
  let addresses;
  try {
    addresses = await lookup(new URL(result.websiteUrl).hostname, {
      all: true,
    });
  } catch {
    throw new HttpError("This website could not be found. Check the URL.");
  }
  if (
    !addresses.length ||
    addresses.some((a) => ipaddr.parse(a.address).range() !== "unicast")
  )
    throw new HttpError("Use a public website destination.");
  return result;
}
export interface EventContext {
  referral?: { publicId: string; visitorHash: string; ownerTokenHash?: string };
  takeoverId: string;
  visitorHash: string;
  pageId: string;
  region: string;
  city?: string;
  issuedAt: number;
  expiresAt: number;
  excluded: boolean;
}
export function signContext(context: EventContext) {
  const data = Buffer.from(JSON.stringify(context)).toString("base64url");
  return data + "." + keyed("context:" + data);
}
export function readContext(token: string, deliveryGraceMs = 0): EventContext {
  if (typeof token !== "string" || token.length > 3000)
    throw new HttpError("Invalid event context");
  const [data, sig, ...extra] = token.split(".");
  if (!data || !sig || extra.length || !/^[a-f0-9]{64}$/.test(sig))
    throw new HttpError("Invalid event context");
  const expected = Buffer.from(keyed("context:" + data));
  if (!timingSafeEqual(Buffer.from(sig), expected))
    throw new HttpError("Invalid event context");
  const value = JSON.parse(Buffer.from(data, "base64url").toString());
  if (value.expiresAt + deliveryGraceMs < Date.now())
    throw new HttpError("Event context expired");
  return value;
}
export function trafficContext(req: Request) {
  let city = "";
  if (process.env.VERCEL === "1") {
    try { city = decodeURIComponent(req.headers.get("x-vercel-ip-city") ?? "").trim().slice(0, 160); } catch {}
  }
  const production =
    process.env.PUBLIC_METRICS_ENABLED === "true" &&
    process.env.WALL_ENVIRONMENT === "production" &&
    process.env.VERCEL_ENV === "production";
  return {
    excluded: excludedTraffic(
      req.headers.get("user-agent") ?? "",
      production,
      req.headers.get("x-wall-test") === "1",
    ),
    city,
    region:
      process.env.VERCEL === "1"
        ? (req.headers.get("x-vercel-ip-country") ?? "ZZ")
        : "ZZ",
  };
}
export const opaqueId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{16,100}$/.test(value);
