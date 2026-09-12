// @vitest-environment node
import { afterEach, it, expect, vi } from "vitest";
import { readReferral, signReferral, REFERRAL_AGE } from "../lib/referral";
afterEach(() => vi.unstubAllEnvs());
it("accepts only unexpired signed public referral IDs", () => {
  vi.stubEnv("WALL_TOKEN_SECRET", "x".repeat(40));
  const id = "ttw_" + "a".repeat(32),
    now = 1700000000000,
    token = signReferral(id, now);
  expect(readReferral(token, now + 1)).toBe(id);
  expect(
    readReferral(token.replace("ttw_a", "ttw_b"), now + 1),
  ).toBeUndefined();
  expect(readReferral(token, now + REFERRAL_AGE * 1000)).toBeUndefined();
  expect(readReferral(token + ":extra", now)).toBeUndefined();
  expect(readReferral(undefined, now)).toBeUndefined();
  expect(readReferral("bad", now)).toBeUndefined();
  vi.stubEnv("WALL_TOKEN_SECRET", "y".repeat(40));
  expect(readReferral(token, now)).toBeUndefined();
});
