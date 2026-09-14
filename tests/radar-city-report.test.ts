import { afterEach, expect, it, vi } from "vitest";
import { readRadarCityReport } from "../lib/radar-city-report";
const date = "2026-09-14", from = date + "T00:00:00.000Z", to = date + "T12:00:00.000Z";
afterEach(() => vi.unstubAllGlobals());
function provider(overrides: Record<string, unknown> = {}) {
  const fetcher = vi.fn(async (url: URL) => Response.json({ apiVersion: "1", site: { id: "site" }, traffic: "exclude_bots", range: { from, to }, filter: { event: "wall_impression" }, data: url.pathname.endsWith("breakdowns") ? { dimension: "city", truncated: false, rows: [{ value: "London, England, GB", uniqueVisitors: 2, events: 3 }, { value: "Fort Washington, Maryland, US", uniqueVisitors: 2, events: 4 }] } : { totals: { uniqueVisitors: 3, events: 7 } }, ...overrides }));
  vi.stubGlobal("fetch", fetcher);return fetcher;
}
it("keeps global uniques independent of city sums and limits output to coarse city statistics", async () => {
  const fetcher = provider();
  const report = await readRadarCityReport("secret", "site", date, to);
  expect(report.uniqueVisitors).toBe(3);
  expect(report.cities.reduce((sum, row) => sum + row.visitors, 0)).toBe(4);
  expect(report.cities[1]).toMatchObject({ city: "Fort Washington", country: "US", visitors: 2 });
  expect(JSON.stringify(report)).not.toContain("secret");
  for (const [url] of fetcher.mock.calls) {
    expect(url.searchParams.get("event")).toBe("wall_impression");
    expect(url.searchParams.get("traffic")).toBe("exclude_bots");
  }
});
it.each([{ site: { id: "another-site" } }, { filter: null }, { range: { from, to: from } }, { traffic: "all" }])("rejects an unexpected provider scope: %j", async overrides => {
  provider(overrides);
  await expect(readRadarCityReport("secret", "site", date, to)).rejects.toThrow("scope");
});
it("does not turn provider failures into zero visitors", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
  await expect(readRadarCityReport("secret", "site", date, to)).rejects.toThrow("unavailable");
});
