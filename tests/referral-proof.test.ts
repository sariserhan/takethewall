// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
import { signReferralProof, checkReferralProof } from "../lib/referral-proof";
import { referralEmbeds } from "../lib/referral-embeds";
afterEach(() => vi.unstubAllEnvs());
it("binds proof to the page, browser, network and short time window", () => {
  vi.stubEnv("WALL_TOKEN_SECRET", "x".repeat(40));
  const now = 1700000000000,
    proof = signReferralProof("page", "browser", "network", now);
  expect(
    checkReferralProof(proof, "page", "browser", "network", now + 5000),
  ).toBe(true);
  for (const [page, browser, network, time] of [
    ["other", "browser", "network", now + 5000],
    ["page", "other", "network", now + 5000],
    ["page", "browser", "other", now + 5000],
    ["page", "browser", "network", now + 4999],
    ["page", "browser", "network", now + 120001],
  ] as const)
    expect(checkReferralProof(proof, page, browser, network, time)).toBe(false);
});
it("all embeds use the tracked public share URL and contain no script or private token", () => {
  const e = referralEmbeds("ttw_" + "a".repeat(32), "https://takethewall.com");
  for (const code of Object.values(e.formats)) {
    expect(code.replaceAll("&amp;", "&")).toContain(e.href);
    expect(code).not.toContain("<script");
    expect(code).not.toContain("ttw-owner");
  }
  expect(new URL(e.href).pathname).toBe("/");
  expect(new URL(e.href).searchParams.get("ref")).toBe("ttw_" + "a".repeat(32));
  expect(e.formats.banner).toContain("width:100%");
  expect(e.formats.footer).toContain("TakeTheWall");
  const attack = referralEmbeds(
    '\"><script>alert(1)</script>',
    "https://takethewall.com",
  );
  expect(attack.formats.banner).not.toContain("<script>");
});
