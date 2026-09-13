import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { HistoryPage } from "../lib/history-types";
test.skip(
  !process.env.TTW_GROWTH_FIXTURES,
  "Run through scripts/test-growth-browser.mjs for isolated SSR fixtures.",
);
test("history, public referral link, and published sharing work on desktop and mobile", async ({
  page,
  request,
}, info) => {
  const response = await request.get("/api/history");
  expect(response.ok()).toBeTruthy();
  const history: HistoryPage = await response.json();
  expect(history.entries.length).toBeGreaterThan(0);
  const entry = history.entries[0];
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "WALL HISTORY." }),
  ).toBeVisible();
  await expect(
    page.locator(`.history-grid a[href="/takeover/${entry.publicId}"]`).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: `/tmp/growth-history-${info.project.name}.png`,
    fullPage: true,
  });
  let visits = 0;
  await page.route("**/api/referrals", (r) => {
    visits++;
    expect(r.request().postDataJSON().publicId).toBe(entry.publicId);
    return r.fulfill({ status: 204 });
  });
  await page.goto(`/takeover/${entry.publicId}?via=share`);
  await expect.poll(() => visits).toBe(1);
  expect(new URL((await page.locator('link[rel="canonical"]').getAttribute("href"))!).pathname).toBe("/");
  expect(new URL(page.url()).pathname).toBe("/");
  expect(new URL(page.url()).searchParams.get("ref")).toBe(entry.publicId);
  await page.goto(`/takeover/${entry.publicId}`);
  expect(visits).toBe(1);
  await expect(page.getByRole("region",{name:"Takeover content"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Takeover statistics"})).toBeVisible();
  const contentBounds = await page.getByRole("region",{name:"Takeover content"}).boundingBox();
  const statBounds = await page.getByRole("region",{name:"Takeover statistics"}).boundingBox();
  expect(contentBounds!.x).toBeCloseTo(statBounds!.x,0);
  expect(contentBounds!.width).toBeCloseTo(statBounds!.width,0);
  await expect(page.getByRole("heading",{name:"Share the takeover."})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:`/tmp/ttw-takeover-record-${info.project.name}.png`,fullPage:true});
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: { state: "replaced", publicId: entry.publicId, durationMs: 1000 },
    }),
  );
  await page.goto("/?purchase=" + "a".repeat(64));
  const dialog = page.getByRole("dialog", {
    name: "YOUR TAKEOVER IS PUBLISHED.",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img")).toBeVisible();
  await dialog.getByLabel("Image format").selectOption("portrait");
  await expect(
    dialog.getByRole("link", { name: "Download image" }),
  ).toHaveAttribute(
    "href",
    new RegExp(`/takeover/${entry.publicId}/card\\?format=portrait&download=1`),
  );
  await expect(
    dialog.getByRole("link", { name: "Open public page" }),
  ).toHaveAttribute("href", `/takeover/${entry.publicId}`);
  await expect(page).not.toHaveURL(/purchase=/);
  expect(
    (await new AxeBuilder({ page }).include("dialog[open]").analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: `/tmp/growth-published-${info.project.name}.png`,
  });
  await dialog.getByRole("button", { name: /Close/ }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain("/history");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("/takeover-sitemap-0.xml");
  const shard = await request.get("/takeover-sitemap-0.xml");
  expect(shard.status()).toBe(200);
  expect(await shard.text()).toContain("<urlset");
});
test("admin prepares a social post and reviews search eligibility within /admin", async ({
  page,
  request,
}, info) => {
  const history: HistoryPage = await (await request.get("/api/history")).json();
  const entry = history.entries[0];
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
  await page.route("**/api/auth/**", (r) =>
    r.fulfill({
      json: r.request().url().includes("token")
        ? { token }
        : {
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
    }),
  );
  await page.route("**/api/admin/health", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  let saved = false,
    historyVisible = true;
  await page.routeWebSocket(/convex.*\/sync/, (socket) => {
    let tick = 0;
    const timestamp = () => {
      const b = Buffer.alloc(8);
      b.writeBigUInt64LE(BigInt(tick));
      return b.toString("base64");
    };
    let version = { querySet: 0, identity: 0, ts: timestamp() };
    const queries = new Map<number, string>();
    const value = (path: string) =>
      path === "growth:visibility"
        ? historyVisible
        : path === "growth:adminHistory"
          ? history
          : path === "admin:identity"
            ? "admin-fixture"
            : path === "admin:overview"
              ? ({ site: {}, milestones: [] })
              : path === "growth:kit"
                ? {
                    revision: 0,
                    summary: "",
                    approved: saved,
                    visitors: 12,
                    purchases: 2,
                  }
                : null;
    const transition = (
      changes: unknown[],
      patch: Partial<typeof version> = {},
    ) => {
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
    };
    socket.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "Authenticate")
        transition([], { identity: msg.baseVersion + 1 });
      if (msg.type === "ModifyQuerySet")
        transition(
          msg.modifications.map(
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
          ),
          { querySet: msg.newVersion },
        );
      if (msg.type === "Mutation") {
        if (msg.udfPath === "growth:setHistoryVisibility") {
          historyVisible = msg.args[0].enabled;
        } else {
          expect(msg.udfPath).toBe("growth:review");
          expect(msg.args[0]).toMatchObject({
            publicId: entry.publicId,
            approved: true,
            expectedRevision: 0,
          });
          saved = true;
        }
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
          [...queries].map(([id, path]) => ({
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
  await page.getByRole("button", { name: "growth", exact: true }).click();
  const historyToggle = page.getByRole("checkbox", {
    name: "Show Wall History publicly",
  });
  await expect(historyToggle).toBeChecked();
  await historyToggle.click();
  await expect(historyToggle).not.toBeChecked();
  await historyToggle.click();
  await expect(historyToggle).toBeChecked();
  await page.getByLabel("Public takeover ID").fill(entry.publicId);
  await expect(
    page.getByRole("heading", { name: "Social post kit" }),
  ).toBeVisible();
  await expect(
    page.getByText("12 unique referred browsers · 2 paid takeovers"),
  ).toBeVisible();
  await page
    .getByLabel("Editorial overview")
    .fill(
      "An original overview explaining this studio’s creative work, the project it brought to the wall, and the independent maker behind it. Explore the public takeover for more information about the project.",
    );
  await page
    .getByRole("button", { name: "Approve for search", exact: true })
    .click();
  await expect(
    page.getByText("Approved for search discovery.", { exact: false }),
  ).toBeVisible();
  expect(saved).toBe(true);
  await expect(page).toHaveURL(/\/admin$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/growth-admin-${info.project.name}.png`,
    fullPage: true,
  });
});
