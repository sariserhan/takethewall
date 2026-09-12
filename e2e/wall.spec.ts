import { test, expect } from "@playwright/test";
test("one wall, actual metrics, accessible sheet, preview, and legal dialogs", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/Take The Wall/);
  await expect(page.locator(".owner-ad h2")).toHaveText("visitorping.com");
  await expect(page.locator(".owner-logo")).toBeVisible();
  await expect(page.locator(".owner-logo")).toHaveJSProperty(
    "naturalWidth",
    256,
  );
  await expect(page.locator(".site-metrics")).toContainText("PAID TAKEOVERS");
  await expect(page.locator(".owner-ad")).toHaveAttribute("target", "_blank");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /TAKE THE WALL —/ }).click();
  const sheet = page.getByRole("dialog", { name: "MAKE IT YOURS." });
  await expect(sheet).toBeVisible();
  await page.getByLabel("Website URL").fill("https://example.com");
  await page.getByLabel("Description").fill("A little piece of the internet.");
  await expect(sheet.locator(".preview h3")).toHaveText("example.com");
  await expect(sheet.locator(".preview-ad p")).toHaveText(
    "A little piece of the internet.",
  );
  await expect(page.getByLabel("Buyer email")).toHaveCount(0);
  await page.getByLabel(/^Logo /).setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(sheet.getByRole("alert")).toContainText("PNG, JPEG, or WEBP");
  await sheet.getByRole("button", { name: "Close dialog" }).click();
  await expect(sheet).not.toBeVisible();
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Privacy" })).toContainText(
    "Private purchase and support information",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Privacy" })).not.toBeVisible();
  expect(errors).toEqual([]);
});
test("cancellation restores the draft without a success message", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    sessionStorage.setItem(
      "ttw-draft",
      JSON.stringify({
        websiteUrl: "https://example.com",
        description: "Saved draft",
        buyerEmail: "private@example.com",
        uploadKey: "",
        logoUrl: "",
        requestKey: "a".repeat(32),
      }),
    ),
  );
  await page.goto("/?cancelled=1");
  await expect(
    page.getByRole("dialog", { name: "MAKE IT YOURS." }),
  ).toBeVisible();
  await expect(page.getByLabel("Website URL")).toHaveValue(
    "https://example.com",
  );
  await expect(page).toHaveURL("/");
  await expect(page.getByText("The wall is yours. For now.")).toHaveCount(0);
});
test("opaque token is removed and an invalid confirmation never claims ownership", async ({
  page,
}) => {
  await page.goto("/?purchase=" + "x".repeat(43));
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("status")).toContainText("invalid or expired");
  await expect(page.getByText("The wall is yours. For now.")).toHaveCount(0);
});
test("valid logo is decoded and uploaded through the server", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /TAKE THE WALL —/ }).click();
  await page.getByLabel(/^Logo /).setInputFiles("public/visitorping.png");
  await expect(page.getByAltText("Your logo preview")).toBeVisible({
    timeout: 20000,
  });
});
