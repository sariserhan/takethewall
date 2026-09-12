import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import { readVisitorPingTotals } from "../lib/visitorping-api";
const modules = import.meta.glob("../convex/**/*.ts");
const args = {
  apiKey: "secret",
  siteId: "site/a",
  takeoverId: "owner&other=x",
  event: "wall_impression" as const,
  from: "2026-09-11T00:00:00Z",
  to: "2026-09-11T01:00:00Z",
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("filters and authenticates reads, using aggregate uniques rather than series sums", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        apiVersion: "1",
        site: { id: args.siteId },
        range: { from: args.from, to: args.to },
        data: {
          totals: { events: 8, uniqueVisitors: 3 },
          series: [{ uniqueVisitors: 3 }, { uniqueVisitors: 3 }],
        },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(await readVisitorPingTotals(args)).toEqual({
    events: 8,
    uniqueVisitors: 3,
  });
  const [url, options] = fetcher.mock.calls[0];
  expect(url.pathname).toContain("site%2Fa");
  expect(url.searchParams.get("traffic")).toBe("all");
  expect(url.searchParams.get("value")).toBe(args.takeoverId);
  expect(url.searchParams.get("event")).toBe("wall_impression");
  expect(options.headers.Authorization).toBe("Bearer secret");
  expect(options.redirect).toBe("error");
});
it("honors Retry-After without recording provider response bodies", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("private provider details", {
          status: 429,
          headers: { "Retry-After": "180" },
        }),
      ),
  );
  await expect(readVisitorPingTotals(args)).rejects.toMatchObject({
    retryAfterMs: 180_000,
    message: "VisitorPing HTTP 429",
  });
});
it("rejects malformed aggregates", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          apiVersion: "1",
          site: { id: args.siteId },
          range: { from: args.from, to: args.to },
          data: { totals: { events: -1, uniqueVisitors: "3" } },
        }),
      ),
  );
  await expect(readVisitorPingTotals(args)).rejects.toThrow(
    "Invalid VisitorPing",
  );
});
async function seeded() {
  const t = convexTest(schema, modules);
  const logoStorageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["logo"])),
  );
  const id = await t.mutation(internal.wall.seed, { logoStorageId });
  vi.advanceTimersByTime(10_000);
  return { t, id };
}
it("shares one lease and retains the successful snapshot through failures", async () => {
  const { t, id } = await seeded();
  const claim = (await t.mutation(internal.visitorping.claim, {}))!;
  expect(await t.mutation(internal.visitorping.claim, {})).toBeNull();
  const snapshot = {
    takeoverId: id,
    from: claim.from,
    to: claim.to,
    fetchedAt: Date.now(),
    impressions: 12,
    uniqueVisitors: 4,
    clicks: 2,
  };
  await t.mutation(internal.visitorping.finish, {
    attempt: claim.attempt,
    snapshot,
  });
  vi.advanceTimersByTime(30_000);
  const retry = (await t.mutation(internal.visitorping.claim, {}))!;
  await t.mutation(internal.visitorping.finish, {
    attempt: retry.attempt,
    error: "VisitorPing HTTP 429",
    retryAfterMs: 180_000,
  });
  const report = await t.query(internal.visitorping.report, {});
  expect(report.snapshot).toEqual(snapshot);
  expect(report.nextAt).toBeGreaterThanOrEqual(Date.now() + 180_000);
  expect(await t.mutation(internal.visitorping.claim, {})).toBeNull();
});
it("discards responses for an owner replaced during a provider request", async () => {
  const { t, id } = await seeded();
  const claim = (await t.mutation(internal.visitorping.claim, {}))!;
  await t.run(async (ctx) => {
    const owner = (await ctx.db.get(id))!;
    const { _id, _creationTime, ...fields } = owner;
    void _id;
    void _creationTime;
    const replacement = await ctx.db.insert("takeovers", {
      ...fields,
      activatedAt: Date.now(),
    });
    const site = (await ctx.db.query("siteStats").first())!;
    await ctx.db.patch(site._id, { currentTakeoverId: replacement });
  });
  await t.mutation(internal.visitorping.finish, {
    attempt: claim.attempt,
    snapshot: {
      takeoverId: id,
      from: claim.from,
      to: claim.to,
      fetchedAt: Date.now(),
      impressions: 12,
      uniqueVisitors: 4,
      clicks: 2,
    },
  });
  expect((await t.query(internal.visitorping.report, {})).snapshot).toBeNull();
});
it("does not contact the production API from a test deployment", async () => {
  const { t } = await seeded();
  vi.stubEnv("VISITORPING_API_KEY", "secret");
  vi.stubEnv("VISITORPING_SITE_ID", "site");
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  vi.stubEnv("PUBLIC_METRICS_ENABLED", "true");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await t.action(internal.visitorping.refresh, {});
  expect(fetcher).not.toHaveBeenCalled();
});
it("refreshes both event totals and saves a report without exposing credentials", async () => {
  const { t, id } = await seeded();
  vi.stubEnv("VISITORPING_API_KEY", "secret");
  vi.stubEnv("VISITORPING_SITE_ID", "site");
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  vi.stubEnv("PUBLIC_METRICS_ENABLED", "true");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) =>
      Response.json({
        apiVersion: "1",
        site: { id: "site" },
        range: {
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
        },
        data: {
          totals: {
            events: url.searchParams.get("event") === "wall_impression" ? 8 : 2,
            uniqueVisitors: 3,
          },
        },
      }),
    ),
  );
  await t.action(internal.visitorping.refresh, {});
  const report = await t.query(internal.visitorping.report, {});
  expect(report.snapshot).toMatchObject({
    takeoverId: id,
    impressions: 8,
    clicks: 2,
    uniqueVisitors: 3,
  });
  expect(JSON.stringify(report)).not.toContain("secret");
});
