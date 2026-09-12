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

test("informational routes open homepage overlays and milestones remain separate", async ({
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
    "how-it-works",
    "content-policy",
    "numbers",
  ]) {
    const response = await page.goto("/" + path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page).toHaveTitle(/Take The Wall/);
    if (path === "rewards") {
      await expect(
        page.getByRole("dialog").locator("p").filter({
          hasText: "Submit an initial claim within seven calendar days.",
        }),
      ).toBeVisible();
      await expect(page.getByText("Loading Reward Rules…")).toHaveCount(0);
    }
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
  await page.goto("/admin/publish");
  await expect(page.getByRole("heading", { name: "ADMIN SIGN IN" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview placement" })).toHaveCount(0);
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

test("one footer opens information in-place and includes every milestone", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("footer")).toHaveCount(1);
  for (const title of [
    "How it works",
    "About",
    "Support",
    "Contact",
    "Reward Rules",
    "About the numbers",
    "Terms",
    "Privacy",
    "Content policy",
    "Disclaimer",
    "Disclosure",
  ]) {
    await page
      .locator("footer")
      .getByRole("link", { name: title, exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: title, exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  }
  for (const n of [100, 1000, 10000, 100000, 1000000])
    await expect(page.locator(`footer a[href="/${n}"]`)).toBeVisible();
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.getBoundingClientRect().height >= innerHeight - 1),
  ).toBe(true);
});

test("website checkout needs no image and legal overlays preserve its draft", async ({
  page,
}) => {
  await page.goto("/?take=1");
  const sheet = page.getByRole("dialog", { name: "MAKE IT YOURS." });
  await sheet.getByLabel("Website URL").fill("https://example.com");
  await expect(sheet.getByLabel("Buyer email")).toHaveCount(0);
  await sheet.getByRole("link", { name: "Terms", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Terms", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Website URL")).toHaveValue(
    "https://example.com",
  );
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  await page.route("**/api/checkout", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Checkout endpoint reached without image",
      }),
    }),
  );
  await sheet.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" }).click();
  await sheet.getByLabel("Buyer email").fill("buyer@example.com");
  await sheet.getByRole("button", { name: "PAY $3.99 & TAKE THE WALL" }).click();
  await expect(sheet.getByRole("alert")).toContainText(
    "Checkout endpoint reached without image",
  );
  await sheet.getByRole("button", { name: "Close dialog" }).click();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});
