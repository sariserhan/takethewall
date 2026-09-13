import { timingSafeEqual } from "node:crypto";
import { keyed } from "./server";
export const REFERRAL_BROWSER_COOKIE = "ttw-referral-browser";
export const REFERRAL_WAIT_MS = 5000;
export const REFERRAL_PROOF_AGE_MS = 120000;
function sign(scope: string, value: unknown) {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${keyed(scope + body)}`;
}
function read(scope: string, token: string | undefined): unknown {
  if (!token || token.length > 1500) return;
  const [body, sig, extra] = token.split(".");
  if (extra || !body || !/^[a-f0-9]{64}$/.test(sig ?? "")) return;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(keyed(scope + body))))
    return;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return;
  }
}
export function signReferralBrowser(visitorHash: string) {
  return sign("referral-browser:", { visitorHash });
}
export function readReferralBrowser(
  token: string | undefined,
): string | undefined {
  const value = read("referral-browser:", token) as
    { visitorHash?: unknown } | undefined;
  return typeof value?.visitorHash === "string" &&
    /^[a-f0-9]{64}$/.test(value.visitorHash)
    ? value.visitorHash
    : undefined;
}
export function signReferralProof(
  publicId: string,
  visitorHash: string,
  client: string,
  now = Date.now(),
) {
  return sign("referral-proof:", {
    publicId,
    visitorHash,
    client,
    issuedAt: now,
  });
}
export function checkReferralProof(
  token: unknown,
  publicId: string,
  visitorHash: string,
  client: string,
  now = Date.now(),
) {
  if (typeof token !== "string") return false;
  const p = read("referral-proof:", token) as
    | {
        publicId?: unknown;
        visitorHash?: unknown;
        client?: unknown;
        issuedAt?: unknown;
      }
    | undefined;
  return (
    !!p &&
    p.publicId === publicId &&
    p.visitorHash === visitorHash &&
    p.client === client &&
    typeof p.issuedAt === "number" &&
    Number.isFinite(p.issuedAt) &&
    now - p.issuedAt >= REFERRAL_WAIT_MS &&
    now - p.issuedAt <= REFERRAL_PROOF_AGE_MS
  );
}
