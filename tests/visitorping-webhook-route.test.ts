// @vitest-environment node
import { createHmac } from "node:crypto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
const mocks = vi.hoisted(() => ({ backend: vi.fn() }));
vi.mock("../lib/server", async (original) => ({
  ...(await original<typeof import("../lib/server")>()),
  backend: mocks.backend,
}));
import { POST } from "../app/api/webhooks/visitorping/route";
const modules = import.meta.glob("../convex/**/*.ts");
const secret = "s".repeat(48);
const token = createHmac("sha256", secret)
  .update("visitorping:webhook:v1")
  .digest("hex");
const payload = {
  event: "visitor.arrival",
  data: {
    siteName: "Take The Wall",
    siteDomain: "www.takethewall.com",
    location: {
      city: "Baltimore",
      region: "Maryland",
      country: "United States",
    },
    source: "direct",
    entryPage: "https://www.takethewall.com/?token=private",
    deviceType: "desktop",
    isHotLead: false,
    companyName: "Example",
  },
};
function request(
  value: unknown = payload,
  key = token,
  headers: Record<string, string> = { "Content-Type": "application/json" },
) {
  return new Request(
    `https://www.takethewall.com/api/webhooks/visitorping?token=${encodeURIComponent(key)}`,
    { method: "POST", headers, body: JSON.stringify(value) },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WALL_SERVER_SECRET", secret);
});
afterEach(() => vi.unstubAllEnvs());
it("stores authenticated country/city alerts without touching visitor or reward totals", async () => {
  const t = convexTest(schema, modules);
  mocks.backend.mockImplementation(async (op, args) => {
    expect(op).toBe("visitorPingAlert");
    return t.mutation(internal.visitorPingWebhook.receive, args);
  });
  expect((await POST(request())).status).toBe(200);
  const rows = await t.run((ctx) =>
    ctx.db.query("visitorPingWebhookDeliveries").collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].data).toMatchObject({
    source: "direct",
    siteDomain: "takethewall.com",
    entryPage: "https://www.takethewall.com/",
    location: payload.data.location,
  });
  expect(await t.run((ctx) => ctx.db.query("siteStats").collect())).toEqual([]);
  expect(
    await t.run((ctx) => ctx.db.query("milestoneRewards").collect()),
  ).toEqual([]);
});
it("rejects missing, incorrect, and non-ASCII tokens before storage", async () => {
  for (const key of ["", "wrong", "é".repeat(64)])
    expect((await POST(request(payload, key))).status).toBe(401);
  expect(mocks.backend).not.toHaveBeenCalled();
});
it("accepts a Bearer header and hot-lead alerts", async () => {
  mocks.backend.mockResolvedValue(null);
  expect(
    (
      await POST(
        request({ ...payload, event: "visitor.hot_lead" }, "", {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        }),
      )
    ).status,
  ).toBe(200);
});
it("rejects other domains, events, invalid field types, and unsupported content types", async () => {
  for (const value of [
    { ...payload, event: "payment.completed" },
    { ...payload, data: { ...payload.data, siteDomain: "other.com" } },
    { ...payload, data: { ...payload.data, isHotLead: "yes" } },
    { ...payload, data: { ...payload.data, location: { city: [] } } },
  ])
    expect((await POST(request(value))).status).toBe(400);
  expect(
    (await POST(request(payload, token, { "Content-Type": "text/plain" })))
      .status,
  ).toBe(415);
  expect(mocks.backend).not.toHaveBeenCalled();
});
it("rejects malformed JSON and oversized bodies even without a content-length header", async () => {
  const raw = new Request(
    `https://www.takethewall.com/api/webhooks/visitorping?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    },
  );
  expect((await POST(raw)).status).toBe(400);
  expect(
    (await POST(request({ ...payload, padding: "x".repeat(17000) }))).status,
  ).toBe(413);
});
it("returns a retryable error when persistence fails and fails closed without configuration", async () => {
  mocks.backend.mockRejectedValue(Error("unavailable"));
  expect((await POST(request())).status).toBe(503);
  vi.stubEnv("WALL_SERVER_SECRET", "");
  expect((await POST(request())).status).toBe(503);
});
it("preserves separate deliveries because this payload has no reliable deduplication ID", async () => {
  const t = convexTest(schema, modules);
  mocks.backend.mockImplementation((_op, args) =>
    t.mutation(internal.visitorPingWebhook.receive, args),
  );
  await POST(request());
  await POST(request());
  expect(
    await t.run((ctx) =>
      ctx.db.query("visitorPingWebhookDeliveries").collect(),
    ),
  ).toHaveLength(2);
});
it("expires only deliveries older than 90 days", async () => {
  const t = convexTest(schema, modules);
  mocks.backend.mockImplementation((_op, args) =>
    t.mutation(internal.visitorPingWebhook.receive, args),
  );
  await POST(request());
  await t.run(async (ctx) => {
    const row = (await ctx.db.query("visitorPingWebhookDeliveries").first())!;
    const { _id: unusedId, _creationTime: unusedTime, ...data } = row;
    void unusedId;
    void unusedTime;
    await ctx.db.insert("visitorPingWebhookDeliveries", {
      ...data,
      receivedAt: Date.now() - 91 * 86400_000,
    });
  });
  await t.mutation(internal.visitorPingWebhook.cleanup, {});
  expect(
    await t.run((ctx) =>
      ctx.db.query("visitorPingWebhookDeliveries").collect(),
    ),
  ).toHaveLength(1);
});
