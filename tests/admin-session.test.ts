import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import betterAuth from "@convex-dev/better-auth/test";
import schema from "../convex/schema";
import { api, components } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
it("resolves verified admin from a live Better Auth session without JWT email claims", async () => {
  vi.stubEnv("ADMIN_EMAILS", "serhan.sari@yahoo.com");
  const t = convexTest(schema, modules);
  betterAuth.register(t);
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: {
        name: "Test administrator",
        email: "serhan.sari@yahoo.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  const session = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "session",
      data: {
        userId: user._id,
        token: "test-only-token",
        expiresAt: now + 60000,
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  const client = t.withIdentity({ subject: user._id, sessionId: session._id });
  expect(await client.query(api.admin.identity, {})).toBe(user._id);
  await expect(
    t
      .withIdentity({
        subject: "different-user",
        sessionId: session._id,
        email: "serhan.sari@yahoo.com",
        emailVerified: true,
      })
      .query(api.admin.identity, {}),
  ).rejects.toThrow("Administrator access required");
  await t.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: "user",
      where: [{ field: "_id", value: user._id }],
      update: { emailVerified: false },
    },
  });
  await expect(client.query(api.admin.identity, {})).rejects.toThrow(
    "Administrator access required",
  );
});
it("rejects expired Better Auth sessions even with verified JWT email claims", async () => {
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  const t = convexTest(schema, modules);
  betterAuth.register(t);
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: {
        name: "Admin",
        email: "admin@example.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  const session = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "session",
      data: {
        userId: user._id,
        token: "expired-test-token",
        expiresAt: now - 1,
        createdAt: now - 10000,
        updatedAt: now,
      },
    },
  });
  await expect(
    t
      .withIdentity({
        subject: user._id,
        sessionId: session._id,
        email: "admin@example.com",
        emailVerified: true,
      })
      .query(api.admin.identity, {}),
  ).rejects.toThrow("Administrator access required");
});
