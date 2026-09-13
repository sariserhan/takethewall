import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
it("restores standard dual tiers while preserving reached rehearsal rewards", async () => {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://aromatic-falcon-454.convex.cloud");
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  const t = convexTest(schema, modules);
  await t.mutation(internal.rehearsal.prepare, {});
  const id = await t.run((ctx) =>
    ctx.db.insert("milestoneRewards", {
      milestoneNumber: 1,
      rewardUsd: 1,
      originalCandidateNumber: 1,
      candidateNumber: 1,
      status: "pending_claim",
      rulesVersion: "development-rehearsal-v1",
      rulesHash: "old-hash",
      initialDays: 1,
      additionalDays: 1,
      outboundLinkEnabled: false,
    }),
  );
  const before = await t.run((ctx) => ctx.db.get(id));
  expect(await t.mutation(internal.rehearsal.finish, {})).toEqual({
    changed: true,
  });
  expect(await t.run((ctx) => ctx.db.get(id))).toEqual(before);
  const overview = await t.query(api.rewards.overview, { summary: true });
  expect(overview.milestones.map((m) => m.number)).toEqual([
    100, 1000, 10000, 100000, 1000000,
  ]);
  expect(
    overview.milestones.every((m) => m.performance?.rewardUsd === m.rewardUsd),
  ).toBe(true);
  const historical = await t.query(api.rewards.overview, { number: 1 });
  expect(historical.milestones[0].status).toBe("pending_claim");
  expect(await t.mutation(internal.rehearsal.finish, {})).toEqual({
    changed: false,
  });
});
it("refuses any other deployment or production environment", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("CONVEX_CLOUD_URL", "https://other.convex.cloud");
  vi.stubEnv("WALL_ENVIRONMENT", "test");
  await expect(t.mutation(internal.rehearsal.finish, {})).rejects.toThrow(
    "personal test",
  );
  vi.stubEnv("CONVEX_CLOUD_URL", "https://aromatic-falcon-454.convex.cloud");
  vi.stubEnv("WALL_ENVIRONMENT", "production");
  await expect(t.mutation(internal.rehearsal.finish, {})).rejects.toThrow(
    "personal test",
  );
});
