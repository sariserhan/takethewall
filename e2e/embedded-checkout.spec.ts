import { test, expect } from "@playwright/test";

test("embedded checkout stays in the overlay and waits for server activation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://js.stripe.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Stripe = function () { return { elements: function(){}, createToken: function(){}, createPaymentMethod: function(){}, confirmCardPayment: function(){}, createEmbeddedCheckoutPage: async function(options) { let target; return { mount: function(el) { target = typeof el === 'string' ? document.querySelector(el) : el; const button = document.createElement('button'); button.textContent = 'Complete simulated payment'; button.onclick = options.onComplete; target.appendChild(button); }, unmount: function() { if(target) target.innerHTML=''; }, destroy: function() { if(target) target.innerHTML=''; } }; } }; };`,
    }),
  );
  await page.route("**/api/checkout", (route) =>
    route.fulfill({
      json: {
        clientSecret: "cs_test_demo_secret_demo",
        publishableKey: "pk_test_demo",
        token: "a".repeat(64),
      },
    }),
  );
  let confirmed = false;
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        state: confirmed ? "active" : "pending",
        durationMs: null,
        previousOwnerName: confirmed ? "Paper Planes" : null,
        ...(confirmed ? { publicId: "ttw_" + "a".repeat(32) } : {}),
      },
    }),
  );
  await page.goto("/?take=1");
  const dialog = page.getByRole("dialog", { name: "MAKE IT YOURS." });
  await dialog.getByRole("button", { name: "Me / Message" }).click();
  await dialog.getByLabel("Display name").fill("EMBEDDED CHECKOUT TEST");
  await expect(dialog.getByLabel("Buyer email")).toHaveCount(0);
  await dialog.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" }).click();
  await dialog.getByLabel("Buyer email").fill("test@example.com");
  await dialog
    .getByRole("button", { name: "PAY $4.99 & TAKE THE WALL" })
    .click();
  await dialog
    .getByRole("button", { name: "Complete simulated payment" })
    .click();
  await expect(
    dialog.getByText("Checkout complete. Verifying payment…"),
  ).toBeVisible();
  await expect(dialog.getByText("Your wall is live.")).toHaveCount(0);
  confirmed = true;
  await expect(dialog.getByText("Your wall is live.")).toBeVisible({
    timeout: 10000,
  });
  await expect(
    dialog.getByText("You replaced", { exact: false }),
  ).toContainText("Paper Planes");
  await expect(
    dialog.getByRole("button", { name: "Copy caption" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Open public page" }),
  ).toHaveAttribute("href", "/takeover/ttw_" + "a".repeat(32));
  expect(new URL(page.url()).pathname).toBe("/");
  expect(errors).toEqual([]);
  await dialog.getByRole("button", { name: "Back to the wall" }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("ttw-draft")),
  ).toBeNull();
});
