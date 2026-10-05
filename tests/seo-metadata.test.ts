import { describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { MILESTONES } from "../lib/config";
vi.mock("convex/nextjs", () => ({
  fetchQuery: vi.fn(async () => ({
    promotionEnabled: true,
    milestones: MILESTONES.map(({ takeoverNumber }) => ({
      number: takeoverNumber,
      rewardUsd: takeoverNumber,
    })),
  })),
}));
vi.mock("../components/brand-link", () => ({ BrandLink: () => null }));
vi.mock("../components/public-footer", () => ({ PublicFooter: () => null }));
vi.mock("../components/referral-milestone", () => ({
  ReferralMilestonePage: () => null,
}));
describe("search metadata", () => {
  it("keeps canonical and title in <head> for Googlebot", () => {
    const bots = nextConfig.htmlLimitedBots;
    expect(bots).toBeInstanceOf(RegExp);
    expect(
      (bots as RegExp).test(
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      ),
    ).toBe(true);
  });
  it("gives every referral page its own description and canonical", async () => {
    const { generateMetadata } = await import(
      "../app/[milestone]/referral/page"
    );
    const pages = await Promise.all(
      MILESTONES.map(({ takeoverNumber }) =>
        generateMetadata({
          params: Promise.resolve({ milestone: String(takeoverNumber) }),
        }),
      ),
    );
    const unique = (key: "description" | "title") =>
      new Set(pages.map((p) => ("title" in p ? p[key] : undefined))).size;
    expect(unique("description")).toBe(MILESTONES.length);
    expect(unique("title")).toBe(MILESTONES.length);
    expect(
      pages.map((p) => ("alternates" in p ? p.alternates?.canonical : null)),
    ).toEqual(MILESTONES.map(({ takeoverNumber }) => `/${takeoverNumber}/referral`));
  });
});
