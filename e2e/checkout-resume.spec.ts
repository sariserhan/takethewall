import { test, expect } from "@playwright/test";
const token = "a".repeat(64);
test("private resume link opens the existing payment on a fresh browser and can request its email", async ({ page }, info) => {
  let opens = 0, emails = 0;
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("https://js.stripe.com/**", route => route.fulfill({ contentType: "application/javascript", body: `window.Stripe = function(){return {elements:function(){},createToken:function(){},createPaymentMethod:function(){},confirmCardPayment:function(){},createEmbeddedCheckoutPage:async function(options){return {mount:function(el){(typeof el==='string'?document.querySelector(el):el).textContent='Existing Stripe checkout';},unmount:function(){},destroy:function(){}}}}};` }));
  await page.route("**/api/checkout/resume", route => {
    const body = route.request().postDataJSON();
    expect(body.token).toBe(token);
    if (body.action === "email") { emails++; return route.fulfill({ json: { ok: true } }); }
    opens++;
    return route.fulfill({ json: { state: "open", name: "Saved project", description: "Original content", session: { clientSecret: "cs_test_saved_secret_value", publishableKey: "pk_test_saved", token } } });
  });
  await page.goto("/#resume=" + token);
  const dialog = page.getByRole("dialog", { name: "YOUR SAVED CHECKOUT." });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(opens).toBe(0);
  await dialog.getByRole("button", { name: "Resume checkout", exact: true }).click();
  await expect(dialog).toContainText("Saved project");
  await expect(dialog).toContainText("Existing Stripe checkout");
  expect(opens).toBe(1);
  await dialog.getByRole("button", { name: "Email me a resume link" }).click();
  await expect(dialog.getByRole("button", { name: "Resume link requested" })).toBeDisabled();
  expect(emails).toBe(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `/tmp/resume-checkout-${info.project.name}.png` });
});
test("expired resume links explain the expiry without opening payment", async ({ page }) => {
  await page.route("**/api/checkout/resume", route => route.fulfill({ json: { state: "expired" } }));
  await page.goto("/#resume=" + token);
  const dialog = page.getByRole("dialog", { name: "YOUR SAVED CHECKOUT." });
  await dialog.getByRole("button", { name: "Resume checkout", exact: true }).click();
  await expect(dialog).toContainText("This checkout has expired");
  await expect(dialog.getByRole("button", { name: "Start a new takeover" })).toBeVisible();
  await expect(dialog.locator("iframe")).toHaveCount(0);
});
