import { timingSafeEqual } from "node:crypto";
import { keyed } from "./server";
export const REFERRAL_COOKIE = "ttw-referral";
export const REFERRAL_AGE = 30 * 86400;
export function signReferral(publicId: string, now = Date.now()) {
  const data = `${publicId}:${now + REFERRAL_AGE * 1000}`;
  return `${data}:${keyed("referral:" + data)}`;
}
export function readReferral(
  token: string | undefined,
  now = Date.now(),
): string | undefined {
  if (!token || token.length > 200) return;
  const [id, expiry, sig, extra] = token.split(":");
  if (
    extra !== undefined ||
    !/^ttw_[a-f0-9]{32}$/.test(id) ||
    !/^[a-f0-9]{64}$/.test(sig ?? "") ||
    !/^\d+$/.test(expiry ?? "")
  )
    return;
  const end = Number(expiry);
  if (end <= now || end > now + REFERRAL_AGE * 1000) return;
  if (
    !timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(keyed("referral:" + id + ":" + expiry)),
    )
  )
    return;
  return id;
}
