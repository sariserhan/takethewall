import { test, expect } from "@playwright/test";

test("personal placements need no website and preserve the purchase preview", async ({
  page,
}) => {
  await page.goto("/?take=1");
  const sheet = page.getByRole("dialog", { name: "MAKE IT YOURS." });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Me / Message" }).click();
  await expect(sheet.getByLabel("Website URL")).toHaveCount(0);
  await sheet.getByLabel("Display name").fill("SERHAN WAS HERE");
  await sheet.getByLabel("Optional message").fill("My moment on the internet.");
  await expect(sheet.locator(".preview h3")).toHaveText("SERHAN WAS HERE");
  await expect(sheet.locator(".preview-ad")).toContainText(
    "My moment on the internet.",
  );
  expect(
    await sheet.getByLabel("Optional avatar/image").getAttribute("required"),
  ).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("all legal and informational pages render with metadata and working milestone routes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of [
    "about",
    "support",
    "contact",
    "terms",
    "privacy",
    "disclaimer",
    "disclosure",
    "rewards",
  ]) {
    const response = await page.goto("/" + path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page).toHaveTitle(/TakeTheWall/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  for (const milestone of [100, 1000, 10000, 100000, 1000000]) {
    const response = await page.goto("/" + milestone);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "NO OWNER YET" }),
    ).toBeVisible();
  }
  expect((await page.goto("/123456"))?.status()).toBe(404);
  expect(errors).toEqual([]);
});

test("private admin and claim pages do not leak records or send analytics", async ({
  page,
}) => {
  const events: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (/visitorping|\/api\/events/.test(r.url())) events.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto("/admin");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(
    page.getByRole("heading", { name: "ADMIN SIGN IN" }),
  ).toBeVisible();
  await expect(page.getByText("Paid takeovers", { exact: true })).toHaveCount(
    0,
  );
  await page.goto("/reward/portal");
  await expect(
    page.getByRole("heading", { name: "SIGN IN TO YOUR CLAIM" }),
  ).toBeVisible();
  await page.goto("/reward/claim/" + "a".repeat(64));
  await expect(
    page.getByRole("heading", { name: "CLAIM YOUR REWARD" }),
  ).toBeVisible();
  await expect(page.getByText("Legal name", { exact: true })).toHaveCount(0);
  expect(events).toEqual([]);
  expect(errors).toEqual([]);
});
