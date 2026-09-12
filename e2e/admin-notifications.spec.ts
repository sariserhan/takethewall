import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
test("admin edits the notification recipient and toggle without leaving /admin", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const token = [
    { alg: "RS256", typ: "JWT" },
    {
      sub: "admin-fixture",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    "fixture",
  ]
    .map((x) =>
      Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString(
        "base64url",
      ),
    )
    .join(".");
  await page.route("**/api/auth/**", (route) => {
    if (route.request().url().includes("token"))
      return route.fulfill({ json: { token } });
    return route.fulfill({
      json: {
        session: {
          id: "session-fixture",
          token: "session-token",
          userId: "admin-fixture",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        user: {
          id: "admin-fixture",
          email: "admin@example.com",
          emailVerified: true,
          name: "Admin",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    });
  });
  await page.route("**/api/admin/health", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  let settings = {
      enabled: true,
      recipient: "serhan.sari@yahoo.com",
      revision: 0,
    },
    saves = 0;
  await page.routeWebSocket(/convex.*\/sync/, (socket) => {
    let tick = 0;
    const timestamp = () => {
      const b = Buffer.alloc(8);
      b.writeBigUInt64LE(BigInt(tick));
      return b.toString("base64");
    };
    let version = { querySet: 0, identity: 0, ts: timestamp() };
    const queries = new Map<number, string>();
    const value = (path: string): unknown =>
      path === "deliveryAdmin:overview"
        ? JSON.stringify({
            emails: [
              {
                id: "job-fixture",
                queue: "jobs",
                kind: "activation_email",
                state: "failed",
                attempts: 12,
                createdAt: Date.now(),
                nextAt: Date.now(),
                error: "Provider unavailable",
                retryBefore: Date.now()+23*3600_000,
              },
            ],
            activations: [
              {
                id: "owner-fixture",
                name: "Pending Studio",
                createdAt: Date.now(),
                sessionId: "cs_test_fixture",
                environment: "test",
                expired: false,
                blocked: false,
              },
            ],
            limit: 50,
          })
        : path === "funnel:report"
          ? {
              visits: 100,
              checkoutStarts: 20,
              paidActivations: 10,
              startedAt: 1789200000000,
              daysTracked: 2,
            }
          : path === "admin:identity"
            ? "admin@example.com"
            : path === "admin:overview"
              ? JSON.stringify({ milestones: [] })
              : path === "admin:getNotificationSettings"
                ? settings
                : path === "admin:getSettings"
                  ? {
                      milestones: [],
                      initialDays: 7,
                      additionalDays: 7,
                      rulesVersion: "test",
                      rulesJson: "{}",
                      rewardsEnabled: false,
                      payoutsEnabled: false,
                      promotionEnabled: false,
                    }
                  : null;
    function transition(
      changes: unknown[],
      patch: Partial<typeof version> = {},
    ) {
      tick++;
      const end = { ...version, ...patch, ts: timestamp() };
      socket.send(
        JSON.stringify({
          type: "Transition",
          startVersion: version,
          endVersion: end,
          modifications: changes,
        }),
      );
      version = end;
    }
    socket.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "Authenticate")
        transition([], { identity: msg.baseVersion + 1 });
      if (msg.type === "ModifyQuerySet") {
        const changes = msg.modifications.map(
          (q: { type: string; queryId: number; udfPath: string }) => {
            if (q.type === "Remove") {
              queries.delete(q.queryId);
              return { type: "QueryRemoved", queryId: q.queryId };
            }
            queries.set(q.queryId, q.udfPath);
            return {
              type: "QueryUpdated",
              queryId: q.queryId,
              value: value(q.udfPath),
              logLines: [],
              journal: null,
            };
          },
        );
        transition(changes, { querySet: msg.newVersion });
      }
      if (msg.type === "Mutation") {
        if (msg.udfPath === "deliveryAdmin:retry") {
          tick++;
          socket.send(
            JSON.stringify({
              type: "MutationResponse",
              requestId: msg.requestId,
              success: true,
              result: null,
              ts: timestamp(),
              logLines: [],
            }),
          );
          transition([]);
          return;
        }
        expect(msg.udfPath).toBe("admin:saveNotificationSettings");
        const a = msg.args[0];
        expect(a.expectedRevision).toBe(settings.revision);
        settings = {
          enabled: a.enabled,
          recipient: a.recipient,
          revision: settings.revision + 1,
        };
        saves++;
        tick++;
        socket.send(
          JSON.stringify({
            type: "MutationResponse",
            requestId: msg.requestId,
            success: true,
            result: null,
            ts: timestamp(),
            logLines: [],
          }),
        );
        transition(
          [...queries]
            .filter(([, path]) => path === "admin:getNotificationSettings")
            .map(([id, path]) => ({
              type: "QueryUpdated",
              queryId: id,
              value: value(path),
              logLines: [],
              journal: null,
            })),
        );
      }
    });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Takeover notifications" }),
  ).toBeVisible();
  await page.getByLabel("Notification recipient").fill("new@example.com");
  await page.getByLabel("Email me when someone takes the wall").uncheck();
  await page
    .getByRole("button", { name: "Save notification settings" })
    .click();
  await expect(page.getByText("Notification settings saved.")).toBeVisible();
  expect(saves).toBe(1);
  expect(settings).toMatchObject({
    enabled: false,
    recipient: "new@example.com",
  });
  await expect(page).toHaveURL(/\/admin$/);
  await page.screenshot({
    path: `/tmp/admin-notifications-${info.project.name}.png`,
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "funnel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Measured activity funnel" }),
  ).toBeVisible();
  await expect(page.locator(".funnel-stages")).toContainText("100");
  await expect(
    page.getByText("Checkout / visit ratio:", { exact: false }),
  ).toContainText("20.0%");
  await page.getByRole("button", { name: "Last 30 days" }).click();
  await expect(
    page.getByRole("button", { name: "Last 30 days" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/admin$/);
  await page.screenshot({
    path: `/tmp/admin-funnel-${info.project.name}.png`,
    fullPage: false,
  });
  await page.route("**/api/admin/recover", (r) =>
    r.fulfill({
      json: {
        message: "Stripe has not confirmed payment. Nothing was published.",
      },
    }),
  );
  await page.getByRole("button", { name: "delivery", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Delivery & activation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry email", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("original delivery key");
  await page
    .getByRole("button", { name: "Check payment & publish if paid" })
    .click();
  await expect(page.getByRole("status")).toContainText("Nothing was published");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `/tmp/delivery-${info.project.name}.png`,
    fullPage: true,
  });
  await expect(page).toHaveURL(/\/admin$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
