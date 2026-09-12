import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("wall subscription form confirms opt-in and handles preferences without leaking the token", async ({
  page,
}, info) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/context", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  await page.route("**/api/wall-subscriptions", (r) => {
    requests.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Notify me when the wall changes" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email address").fill("reader@example.com");
  await dialog.getByLabel("Email frequency").selectOption("daily");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Send confirmation email" }).click();
  await expect(dialog.getByRole("status")).toContainText("Check your inbox");
  expect(requests[0]).toMatchObject({
    action: "subscribe",
    email: "reader@example.com",
    frequency: "daily",
    consent: true,
  });
  expect(
    (await new AxeBuilder({ page }).include("dialog[open]").analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: `/tmp/wall-subscription-${info.project.name}.png`,
    fullPage: false,
  });
  await page.goto("/wall-emails#confirm=" + "a".repeat(64));
  await expect(
    page.getByRole("button", { name: "Confirm my subscription" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/wall-emails$/);
  await page.getByRole("button", { name: "Confirm my subscription" }).click();
  await expect(page.getByRole("status")).toContainText("confirmed");
  await page.goto("/wall-emails#unsubscribe=" + "b".repeat(64));
  await page.getByLabel("Email frequency").selectOption("every");
  await page.getByRole("button", { name: "Save frequency" }).click();
  await expect(page.getByRole("status")).toContainText("frequency updated");
  await page
    .getByRole("button", { name: "Unsubscribe from wall-change emails" })
    .click();
  await expect(page.getByRole("status")).toContainText("unsubscribed");
  expect(requests.at(-1)).toMatchObject({
    action: "unsubscribe",
    token: "b".repeat(64),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
