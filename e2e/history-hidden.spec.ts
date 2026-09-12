import { test, expect } from "@playwright/test";
test.skip(
  !process.env.TTW_HISTORY_HIDDEN_FIXTURE,
  "Run through scripts/test-growth-browser.mjs.",
);
test("hidden archive is unavailable publicly without disabling individual takeover links", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/history")).status()).toBe(404);
  const history = await page.goto("/history");
  // Next returns 200 after streaming begins; notFound must still remove content and emit noindex.
  expect([200, 404]).toContain(history?.status());
  await expect(
    page.getByRole("heading", { name: "WRONG TURN. RIGHT WALL." }),
  ).toBeVisible();
  await expect(page.locator(".history-grid")).toHaveCount(0);
  await expect(
    page.locator('meta[name="robots"][content*="noindex"]').first(),
  ).toHaveCount(1);
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(
    "/history",
  );
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/history/visibility")),
    page.goto("/"),
  ]);
  await expect(
    page.getByRole("link", { name: "Wall history", exact: true }),
  ).toHaveCount(0);
  const [, shared] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/history/visibility")),
    page.goto("/takeover/ttw_" + "a".repeat(32)),
  ]);
  expect(shared?.status()).toBe(200);
  await expect(
    page.getByRole("link", { name: "Browse wall history" }),
  ).toHaveCount(0);
});
