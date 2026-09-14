import { expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { cityLookup, type CityCenter } from "../lib/radar-geography";
const modules = import.meta.glob("../convex/**/*.ts");
it("publishes only coarse arrival fields, newest first, bounded to 50", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let i = 0; i < 55; i++)
      await ctx.db.insert("visitorPingWebhookDeliveries", {
        event: "visitor.arrival",
        receivedAt: i,
        data: {
          siteName: "Wall",
          siteDomain: "takethewall.com",
          location: { city: "London", country: "GB", region: "PRIVATE" },
          source: "PRIVATE",
          entryPage: "PRIVATE",
          deviceType: "PRIVATE",
          isHotLead: false,
          companyName: "PRIVATE",
        },
      });
    await ctx.db.insert("visitorPingWebhookDeliveries", {
      event: "visitor.hot_lead",
      receivedAt: 100,
      data: {
        siteName: "Wall",
        siteDomain: "takethewall.com",
        location: { city: "Hidden", country: "GB", region: "PRIVATE" },
        source: "",
        entryPage: "",
        deviceType: "",
        isHotLead: true,
        companyName: "PRIVATE",
      },
    });
  });
  const rows = await t.query(api.visitorPingWebhook.radar, {});
  expect(rows).toHaveLength(50);
  expect(rows.map((r) => r.receivedAt)).toEqual(
    Array.from({ length: 50 }, (_, i) => 54 - i),
  );
  expect(Object.keys(rows[0]).sort()).toEqual([
    "city",
    "country",
    "id",
    "receivedAt",
  ]);
  expect(JSON.stringify(rows)).not.toContain("PRIVATE");
});
it("resolves unique normalized cities but refuses ambiguous or empty names", () => {
  const rows: CityCenter[] = [
    ["GB", "London", "London", "", "", "", -0.12, 51.5],
    ["US", "Springfield", "Springfield", "", "", "", -72, 42],
    ["US", "Springfield", "Springfield", "", "", "", -89, 39],
    ["BR", "São Paulo", "Sao Paulo", "", "", "", -46, -23],
    ["JP", "東京", "Tokyo", "", "", "", 139, 35],
  ];
  const lookup = cityLookup(rows);
  expect(lookup.find("London", "UK")).toEqual([-0.12, 51.5]);
  expect(lookup.find("Sao Paulo", "Brazil")).toEqual([-46, -23]);
  expect(lookup.find("Springfield", "US")).toBeNull();
  expect(lookup.find("", "JP")).toBeNull();
  expect(lookup.find("Unknown", "GB")).toBeNull();
});
