import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
export function claimSecret(label: string) {
  const key = process.env.CLAIM_TOKEN_SECRET;
  if (!key || key.length < 32)
    throw new Error("Claim service is not configured");
  return bytesToHex(
    hmac(
      sha256,
      new TextEncoder().encode(key),
      new TextEncoder().encode(label),
    ),
  );
}
// A keyed 256-bit token can be reconstructed for idempotent email retries.
// Only its hash and an independent nonce are persisted; the key lives in server configuration.
export const linkToken = (seed: string) => claimSecret("link:" + seed);
export const otpCode = (seed: string) =>
  String(
    parseInt(claimSecret("otp:" + seed).slice(0, 12), 16) % 1_000_000,
  ).padStart(6, "0");
export const otpDigest = (claimId: string, code: string) =>
  claimSecret("otp-check:" + claimId + ":" + code);
