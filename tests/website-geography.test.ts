import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { readWebsiteGeography } from "../lib/visitorping-geography";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function provider(options: { city?: boolean; truncated?: boolean; invalid?: boolean } = {}) {
  const urls: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
    urls.push(url);
    return Response.json({apiVersion:"1",site:{id:"site"},traffic:"exclude_bots",generatedAt:"2026-09-14T12:00:00Z",historyDays:90,
      range:{from:url.searchParams.get("from"),to:url.searchParams.get("to")},
      data: url.pathname.endsWith("breakdowns") ? {dimension:"country",truncated:options.truncated ?? false,rows:[{value:"US",uniqueVisitors:options.invalid ? -1 : 5},{value:"GB",uniqueVisitors:3}]} : {totals:{uniqueVisitors:6}}
    });
  }));
  return urls;
}
it("reads all retained website history without owner filters and never sums country uniques", async () => {
  const urls=provider({truncated:true});
  const result=await readWebsiteGeography({apiKey:"secret",siteId:"site"});
  expect(urls).toHaveLength(3);
  for(const url of urls) { expect(url.searchParams.has("property")).toBe(false); expect(url.searchParams.has("event")).toBe(false); expect(url.searchParams.get("traffic")).toBe("exclude_bots"); }
  expect(result.uniqueVisitors).toBe(6);
  expect(result.countries.map(c=>c.visitors)).toEqual([5,3]);
  expect(result.truncated).toBe(true);
  expect(result.from).toBe("2026-06-16T12:01:00.000Z");
  expect(result.to).toBe("2026-09-14T11:59:55.000Z");
});
it("rejects invalid geography and honors provider throttling", async () => {
  provider({invalid:true});
  await expect(readWebsiteGeography({apiKey:"secret",siteId:"site"})).rejects.toThrow("country row");
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("",{status:429,headers:{"Retry-After":"3600"}})));
  await expect(readWebsiteGeography({apiKey:"secret",siteId:"site"})).rejects.toMatchObject({retryAfterMs:3600000});
});
it("shares one report, keeps cached data on failure and separates provider sites", async () => {
  vi.stubEnv("VISITORPING_SITE_ID","site");
  const t=convexTest(schema,modules);
  const first=await t.mutation(internal.websiteGeography.claim,{siteId:"site"});
  expect(await t.mutation(internal.websiteGeography.claim,{siteId:"site"})).toBeNull();
  provider();const snapshot=await readWebsiteGeography({apiKey:"secret",siteId:"site"});
  await t.mutation(internal.websiteGeography.finish,{siteId:"site",attempt:first!,snapshot});
  expect((await t.query(api.websiteGeography.report,{})).snapshot?.uniqueVisitors).toBe(6);
  await t.mutation(internal.websiteGeography.finish,{siteId:"site",attempt:first!,retryAfterMs:3600000});
  expect(await t.query(api.websiteGeography.report,{})).toMatchObject({failed:true,snapshot:{uniqueVisitors:6}});
  vi.stubEnv("VISITORPING_SITE_ID","different-site");
  expect((await t.query(api.websiteGeography.report,{})).snapshot).toBeNull();
  const second=await t.mutation(internal.websiteGeography.claim,{siteId:"different-site"});
  expect(second).toBeGreaterThan(first!);
  await t.mutation(internal.websiteGeography.finish,{siteId:"site",attempt:first!,snapshot});
  expect((await t.query(api.websiteGeography.report,{})).snapshot).toBeNull();
});

it("returns an empty report before setup or the first refresh", async () => {
  vi.stubEnv("VISITORPING_SITE_ID", "");
  const t = convexTest(schema, modules);
  expect(await t.query(api.websiteGeography.report, {})).toEqual({ snapshot: null, failed: false });
});
