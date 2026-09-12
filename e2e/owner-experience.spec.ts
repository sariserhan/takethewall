import { test, expect, type Page } from "@playwright/test";
const publicId = "ttw_" + "a".repeat(32);
const owner = {
  id: "owner_browser_fixture",
  contentType: "personal",
  linkType: "other",
  displayName: "Raven Studio",
  takeoverNumber: 16,
  outboundLinkEnabled: false,
  websiteUrl: "",
  domain: "",
  description: "A little corner of the internet.",
  logoUrl: null,
  activatedAt: 1789185600000,
  activationSequence: 1,
  impressions: 120,
  uniqueVisitors: 42,
  clicks: 12,
  kind: "paid",
};
const dashboard = {
  owner,
  active: true,
  replacedAt: null,
  publicId,
  weeklyDigestEnabled: true,
  shareUrl: `https://takethewall.com/takeover/${publicId}`,
  regions: [
    { regionCode: "US", impressions: 90 },
    { regionCode: "GB", impressions: 30 },
  ],
};
async function wallFixture(page: Page) {
  await page.route("**/api/context", (r) =>
    r.fulfill({ status: 503, body: "" }),
  );
  await page.routeWebSocket(/convex.*\/sync/, (socket) => {
    const ids = new Set<number>();
    const server = socket.connectToServer();
    socket.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      for (const c of msg.modifications ?? [])
        if (c.type === "Add" && c.udfPath === "wall:current")
          ids.add(c.queryId);
      server.send(raw);
    });
    server.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      for (const c of msg.modifications ?? [])
        if (c.type === "QueryUpdated" && ids.has(c.queryId))
          c.value = {
            owner,
            totalVisitors: 42,
            totalTakeovers: 16,
            numberingOffset: 15,
            visitorsToday: 10,
            utcDate: "2026-09-14",
            regions: [],
            previousOwnerName: "House placement",
            demoStats: null,
            demoPresentation: null,
          };
      socket.send(JSON.stringify(msg));
    });
  });
}
test("desktop/mobile preview is reviewed before creating checkout", async ({
  page,
}, info) => {
  await wallFixture(page);
  let calls = 0;
  await page.route("**/api/checkout", (r) => {
    calls++;
    return r.fulfill({
      status: 503,
      json: { error: "Simulated checkout response" },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /TAKE THE WALL —/ }).click();
  const sheet = page.getByRole("dialog", { name: "MAKE IT YOURS." });
  await sheet.getByRole("button", { name: "Me / Message" }).click();
  await sheet.getByLabel("Display name").fill("Raven Studio");
  await sheet
    .getByLabel("Optional message")
    .fill("A little corner of the internet.");
  await sheet.getByLabel("Buyer email").fill("buyer@example.com");
  await sheet.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" }).click();
  await expect(sheet).toContainText("Check your content before you pay.");
  expect(calls).toBe(0);
  await sheet.getByRole("button", { name: "Mobile", exact: true }).click();
  await expect(sheet.locator(".preview-device")).toHaveClass(/mobile/);
  await expect(sheet.locator(".preview-creative h3")).toHaveText(
    "Raven Studio",
  );
  await page.screenshot({ path: `/tmp/owner-review-${info.project.name}.png` });
  await sheet.getByRole("button", { name: "Edit content" }).click();
  await expect(sheet.getByLabel("Display name")).toHaveValue("Raven Studio");
  await sheet.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" }).click();
  await sheet
    .getByRole("button", { name: "PAY $3.99 & TAKE THE WALL" })
    .click();
  expect(calls).toBe(1);
  await expect(sheet.getByRole("alert")).toContainText(
    "Simulated checkout response",
  );
});
test("report form attaches the placement and supports anonymous reporting", async ({
  page,
}) => {
  await wallFixture(page);
  let report: Record<string, unknown> | undefined;
  await page.route("**/api/report", (r) => {
    report = r.request().postDataJSON();
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Report this content" }).click();
  const dialog = page.getByRole("dialog", { name: "REPORT CONTENT" });
  await expect(dialog).toContainText("Raven Studio");
  await dialog
    .getByLabel("What should we review?")
    .fill("This link requests bank passwords.");
  await dialog.getByRole("button", { name: "Submit report" }).click();
  await expect(dialog.getByRole("status")).toContainText("Report received");
  expect(report).toMatchObject({
    takeoverId: owner.id,
    email: "",
    reason: "Scam or phishing",
  });
});
test("private dashboard keeps access out of public links and saves digest preferences", async ({
  page,
}, info) => {
  let pref: boolean | undefined;
  const token = "a".repeat(64);
  await page.route("**/api/owner", (r) => {
    const body =
      r.request().method() === "POST" ? r.request().postDataJSON() : {};
    if (body.action === "preferences") {
      pref = body.weeklyDigestEnabled;
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: { dashboard } });
  });
  await page.route("**/takeover/*/card", (r) =>
    r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#d8ff36"/><text x="50" y="180" font-size="80">I TOOK THE WALL. #16</text></svg>',
    }),
  );
  await page.goto(`/owner#token=${token}`);
  await expect(
    page.getByRole("heading", { name: "Raven Studio", exact: true }).first(),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.getByLabel("Public share link")).toHaveValue(
    dashboard.shareUrl,
  );
  expect(await page.getByLabel("Public share link").inputValue()).not.toContain(
    token,
  );
  const toggle = page.getByRole("checkbox", {
    name: "Email me weekly summaries while I own the wall",
  });
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  expect(pref).toBe(false);
  await expect(page.getByRole("status")).toContainText(
    "Weekly summaries stopped",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `/tmp/owner-dashboard-${info.project.name}.png`,
  });
});
test("unsubscribe requires a deliberate action after opening the email link", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/owner/unsubscribe", (r) => {
    calls++;
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/owner/unsubscribe#token=" + "b".repeat(64));
  await expect(
    page.getByRole("button", { name: "Unsubscribe from weekly summaries" }),
  ).toBeEnabled();
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "Unsubscribe from weekly summaries" })
    .click();
  await expect(page.getByRole("status")).toContainText("You are unsubscribed");
  expect(calls).toBe(1);
});

test("current owner previews and saves a correction without checkout", async ({
  page,
}, info) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let current = {
    ...dashboard,
    replacedAt: null as number | null,
    contentRevision: 0,
    owner: { ...owner },
  };
  let edits = 0,
    payments = 0;
  await page.route("**/api/checkout", (r) => {
    payments++;
    return r.fulfill({ status: 500, json: {} });
  });
  await page.route("**/api/owner", (r) => {
    const a = r.request().method() === "POST" ? r.request().postDataJSON() : {};
    if (a.action === "edit") {
      edits++;
      expect(a.expectedRevision).toBe(0);
      expect(a.token).toBeUndefined();
      current = {
        ...current,
        contentRevision: 1,
        owner: {
          ...current.owner,
          displayName: a.displayName,
          description: a.description,
        },
      };
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: { dashboard: current } });
  });
  await page.route("**/takeover/**/card*", (r) =>
    r.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/owner");
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page).toHaveTitle(/Owner|Take The Wall/i);
  await page
    .getByRole("button", { name: "Edit your content", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit your content" });
  await dialog
    .getByLabel("Display name", { exact: true })
    .fill("Raven Studio corrected");
  await dialog
    .getByLabel("Description or message")
    .fill("Correct spelling, same takeover.");
  await dialog
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  expect(edits).toBe(0);
  await expect(
    dialog.getByRole("heading", { name: "Raven Studio corrected" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", {
      name: info.project.name === "mobile" ? "Mobile" : "Desktop",
      exact: true,
    })
    .click();
  await page.screenshot({
    path: `/tmp/owner-edit-${info.project.name}.png`,
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Save changes to the wall" })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Raven Studio corrected", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Your content has been updated.", { exact: false }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(edits).toBe(1);
  expect(payments).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  current = { ...current, active: false, replacedAt: Date.now() };
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Edit your content", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Editing is closed because this takeover is no longer live.",
    ),
  ).toBeVisible();
});
