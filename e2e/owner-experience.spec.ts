import AxeBuilder from "@axe-core/playwright";
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
async function wallFixture(page: Page, impressions = 120, canvasDesign?: string) {
  await page.route("**/api/context", (r) =>
    r.fulfill({ status: 503, body: "" }),
  );
  await page.routeWebSocket(/convex.*\/sync/, (socket) => {
    let tick = 0,
      version = {
        querySet: 0,
        identity: 0,
        ts: Buffer.alloc(8).toString("base64"),
      };
    const value = (path: string) => {
      if (path === "wall:current")
        return {
          owner: { ...owner, impressions, ...(canvasDesign ? {canvasDesign, canvasImages:[]} : {}) },
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
      if (path === "checkoutControls:state") return { paused: false };
      if (path === "wallVotes:totals") return { keep: 0, yeet: 0 };
      if (path === "whispers:history")
        return { page: [], isDone: true, continueCursor: "" };
      return null;
    };
    socket.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type !== "ModifyQuerySet") return;
      const bytes = Buffer.alloc(8);
      bytes.writeBigUInt64LE(BigInt(++tick));
      const end = {
        ...version,
        querySet: msg.newVersion,
        ts: bytes.toString("base64"),
      };
      socket.send(
        JSON.stringify({
          type: "Transition",
          startVersion: version,
          endVersion: end,
          modifications: msg.modifications.map(
            (q: { type: string; queryId: number; udfPath: string }) =>
              q.type === "Remove"
                ? { type: "QueryRemoved", queryId: q.queryId }
                : {
                    type: "QueryUpdated",
                    queryId: q.queryId,
                    value: value(q.udfPath),
                    logLines: [],
                    journal: null,
                  },
          ),
        }),
      );
      version = end;
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
  await sheet.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" }).click();
  await expect(sheet).toContainText("Check your content, then add your email");
  await sheet.getByLabel("Buyer email").fill("buyer@example.com");
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
    .getByRole("button", { name: "PAY $4.99 & TAKE THE WALL" })
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
  const sharp = (await import("sharp")).default;
  const image = await sharp({
    create: { width: 160, height: 80, channels: 3, background: "#4488aa" },
  })
    .png()
    .toBuffer();
  await page.route("**/api/upload", (r) =>
    r.fulfill({
      json: {
        uploadKey: "owner-crop",
        logoUrl: "data:image/png;base64," + image.toString("base64"),
      },
    }),
  );
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
      expect(a.uploadKey).toBe("owner-crop");
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
    .locator("input[type=file]")
    .setInputFiles({ name: "owner.png", mimeType: "image/png", buffer: image });
  await dialog.getByLabel("Image shape").selectOption("square");
  await expect(
    dialog.getByRole("button", { name: "Preview changes", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Apply image", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Preview changes", exact: true }),
  ).toBeEnabled();

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

test("image crop is applied before purchase preview and can be cancelled", async ({
  page,
}, info) => {
  const sharp = (await import("sharp")).default;
  const png = await sharp({
    create: {
      width: 800,
      height: 400,
      channels: 3,
      background: { r: 70, g: 130, b: 170 },
    },
  })
    .png()
    .toBuffer();
  let uploadCalls = 0;
  await wallFixture(page);
  await page.route("**/api/upload", async (route) => {
    uploadCalls++;
    const req = route.request();
    const form = await new Response(new Uint8Array(req.postDataBuffer()!), {
      headers: { "Content-Type": req.headers()["content-type"] },
    }).formData();
    expect(JSON.parse(String(form.get("crop")))).toMatchObject({
      shape: "square",
      zoom: 4,
      x: 100,
    });
    return route.fulfill({
      json: {
        uploadKey: "crop-fixture",
        logoUrl: "data:image/png;base64," + png.toString("base64"),
      },
    });
  });
  await page.goto("/?take=1");
  const dialog = page.getByRole("dialog", { name: "MAKE IT YOURS." });
  await dialog
    .getByRole("button", { name: "Me / Message", exact: true })
    .click();
  await dialog
    .locator("input[type=file]")
    .setInputFiles({ name: "crop.png", mimeType: "image/png", buffer: png });
  await expect(dialog.getByLabel("Image shape")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" }),
  ).toBeDisabled();
  await dialog.getByLabel("Image shape").selectOption("square");
  await dialog.getByRole("slider", { name: /Zoom/ }).press("End");
  await dialog
    .getByRole("slider", { name: "Horizontal position" })
    .press("End");
  await page.screenshot({
    path: `/tmp/crop-${info.project.name}.png`,
    fullPage: false,
  });
  await dialog
    .getByRole("button", { name: "Apply image", exact: true })
    .click();
  await expect(dialog.getByLabel("Image shape")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" }),
  ).toBeEnabled();
  expect(uploadCalls).toBe(1);
  await dialog
    .locator("input[type=file]")
    .setInputFiles({ name: "crop.png", mimeType: "image/png", buffer: png });
  await dialog.getByRole("button", { name: "Cancel image change" }).click();
  expect(uploadCalls).toBe(1);
  await expect(
    dialog.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("returning owner gets a reviewable checkout draft and chooses share formats", async ({
  page,
}) => {
  await wallFixture(page);
  let repeats = 0,
    payments = 0;
  await page.route("**/api/checkout", (r) => {
    payments++;
    return r.fulfill({ status: 500, json: {} });
  });
  await page.route("**/api/owner", (r) => {
    const a = r.request().method() === "POST" ? r.request().postDataJSON() : {};
    if (a.action === "repeat") {
      repeats++;
      return r.fulfill({
        json: {
          draft: {
            contentType: "personal",
            displayName: "Raven Studio",
            description: "A little corner of the internet.",
            websiteUrl: "",
            logoUrl: "",
            uploadKey: "",
            buyerEmail: "owner@example.com",
            weeklyDigestEnabled: false,
          },
        },
      });
    }
    return r.fulfill({
      json: {
        dashboard: {
          ...dashboard,
          contentRevision: 0,
          active: false,
          replacedAt: Date.now(),
        },
      },
    });
  });
  await page.route("**/takeover/**/card*", (r) =>
    r.fulfill({ status: 404, body: "" }),
  );
  await page.route("**/takeover/**/badge", (r) =>
    r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="64"><rect width="400" height="64" fill="#d8ff36"/><text x="20" y="38">TAKE THE WALL · PAST OWNER</text></svg>',
    }),
  );
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value: string) => {
          (window as unknown as { copiedBadge: string }).copiedBadge = value;
        },
      },
    }),
  );
  await page.goto("/owner");
  const postToX = page.getByRole("link", { name: "Post to X" });
  await expect(postToX).toHaveAttribute(
    "href",
    /twitter\.com\/intent\/tweet\?/,
  );
  const intent = new URL((await postToX.getAttribute("href"))!);
  expect(intent.searchParams.get("url")).toContain("/takeover/");
  expect(intent.searchParams.get("url")).toContain("via=share");
  expect(intent.href).not.toContain("token");

  await expect(page.getByRole("region", { name: "Social media referral sharing" })).toBeVisible();
  await page.getByRole("button", { name: "Copy social post", exact: true }).click();
  await expect(page.getByText("Social post copied.", { exact: true })).toBeVisible();
  const socialPost = await page.evaluate(() => (window as unknown as { copiedBadge: string }).copiedBadge);
  expect(socialPost).toContain("Who’s next?");
  expect(socialPost).toContain("via=share");
  expect(socialPost).not.toContain("token=");
  await page
    .getByText("Share your referral link · Website banner & footer", {
      exact: true,
    })
    .click();
  const embed = page.getByLabel("Embed code", { exact: true });
  await expect(embed).toHaveValue(/display:flex/);
  await expect(embed).not.toHaveValue(/token=|owner#/);
  await page.getByRole("button", { name: "Copy embed code" }).click();
  await expect(page.getByText("Embed code copied.")).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedBadge: string }).copiedBadge,
    ),
  ).toBe(await embed.inputValue());
  await page.getByLabel("Embed style").selectOption("html");
  await expect(embed).toHaveValue(/<a href="https?:\/\/.*via=share"/);
  await page.getByLabel("Embed style").selectOption("footer");
  await expect(embed).toHaveValue(/See my takeover on TakeTheWall/);
  await expect(embed).not.toHaveValue(/<img/);
  await page
    .getByRole("button", { name: "Copy referral link", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedBadge: string }).copiedBadge,
    ),
  ).toBe(await page.getByLabel("Your shareable referral link").inputValue());
  await page.getByLabel("Embed style").selectOption("markdown");
  await expect(embed).toHaveValue(/\[!\[My TakeTheWall placement\]/);
  await page.getByLabel("Embed style").selectOption("banner");
  await page
    .locator(".ownership-badge")
    .screenshot({ path: `/tmp/ttw-badge-${test.info().project.name}.png` });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.getByLabel("Share card format").selectOption("portrait");
  await expect(
    page.getByRole("link", { name: "Download card" }),
  ).toHaveAttribute("href", /format=portrait/);
  await page
    .getByRole("button", { name: "Take the wall again — $4.99" })
    .click();
  await expect(page).toHaveURL(/\/\?take=1$/);
  const dialog = page.getByRole("dialog", { name: "MAKE IT YOURS." });
  await expect(dialog.getByLabel("Display name")).toHaveValue("Raven Studio");
  await expect(dialog.getByLabel("Optional message")).toHaveValue(
    "A little corner of the internet.",
  );
  await dialog.getByRole("button", { name: "Preview Morse", exact: true }).click();
  await expect(dialog.locator(".radio-panel blockquote")).toHaveText("A little corner of the internet.");
  await dialog.getByLabel("Optional Morse code message").fill("SOS @ WALL");
  await expect(dialog.locator(".radio-panel blockquote")).toHaveText("SOS @ WALL");
  await expect(dialog.locator(".radio-panel")).toContainText("Radio silent.");
  await dialog.getByRole("button", { name: "Play Morse", exact: true }).click();
  await expect(dialog.locator(".radio-panel")).toContainText("Transmitting");
  await expect(dialog.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" })).toBeVisible();
  await dialog.getByRole("button", { name: "Stop", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("ttw-draft")!).morseMessage)).toBe("SOS @ WALL");
  expect(repeats).toBe(1);
  expect(payments).toBe(0);
  await dialog.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" }).click();
  await expect(dialog.getByLabel("Buyer email")).toHaveValue(
    "owner@example.com",
  );

  await expect(
    dialog.getByRole("button", { name: "PAY $4.99 & TAKE THE WALL" }),
  ).toBeVisible();
  expect(payments).toBe(0);
});
test("milestone signup and email confirmation require deliberate consent", async ({
  page,
}, info) => {
  await wallFixture(page);
  const calls: Record<string, unknown>[] = [];
  await page.route("**/api/alerts", (r) => {
    calls.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Notify me about milestones" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Milestone alerts",
    exact: true,
  });
  await dialog
    .getByLabel("Email address", { exact: true })
    .fill("person@example.com");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Send confirmation email" }).click();
  await expect(dialog.getByRole("status")).toContainText("Check your inbox");
  expect(calls[0]).toMatchObject({
    action: "subscribe",
    consent: true,
    email: "person@example.com",
  });
  await page.goto("/alerts#confirm=" + "b".repeat(64));
  await expect(
    page.getByRole("button", { name: "Confirm my subscription" }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(calls).toHaveLength(1);
  await page.getByRole("button", { name: "Confirm my subscription" }).click();
  await expect(page.getByRole("status")).toContainText("confirmed");
  expect(calls[1].action).toBe("confirm");
  await page.goto("/alerts#unsubscribe=" + "c".repeat(64));
  await expect(
    page.getByRole("button", { name: "Unsubscribe from milestone alerts" }),
  ).toBeVisible();
  expect(calls).toHaveLength(2);
  await page
    .getByRole("button", { name: "Unsubscribe from milestone alerts" })
    .click();
  await expect(page.getByRole("status")).toContainText("unsubscribed");
  await page.screenshot({
    path: `/tmp/milestone-alerts-${info.project.name}.png`,
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("email-only recovery and owner milestone preferences", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let loggedIn = false,
    status = "off",
    recovered = false;
  await page.route("**/api/owner", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          dashboard: loggedIn
            ? { ...dashboard, milestoneAlerts: status }
            : null,
        },
      });
    const a = route.request().postDataJSON();
    if (a.action === "recover") {
      expect(a.email).toBe("receipt@example.com");
      expect(a.number).toBeUndefined();
      recovered = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (a.action === "login") {
      loggedIn = true;
      return route.fulfill({
        json: { dashboard: { ...dashboard, milestoneAlerts: status } },
      });
    }
    if (a.action === "preferences") {
      status = a.milestoneAlertsEnabled ? "pending" : "off";
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/owner");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByLabel("Checkout or receipt email")
    .fill("receipt@example.com");
  await page.getByRole("button", { name: "Email my private link" }).click();
  await expect(page.getByRole("status")).toContainText("no need to pay again");
  expect(recovered).toBe(true);
  await page.goto("/owner#token=" + "a".repeat(64));
  await page.reload();
  await page
    .getByRole("button", { name: "Send milestone confirmation" })
    .click();
  await expect(
    page.getByText("Status: Check your inbox to confirm"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop milestone alerts" }).click();
  await expect(page.getByText("Status: Not subscribed")).toBeVisible();
  await page
    .locator(".owner-preferences")
    .screenshot({ path: `/tmp/preferences-${info.project.name}.png` });
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("dialogs restore keyboard focus and contain navigation", async ({
  page,
}) => {
  await wallFixture(page);
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Notify me about milestones",
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Milestone alerts" });
  await expect(dialog).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((d) => d.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
});

test("ended owners can save private feedback and change their answer", async ({
  page,
}, info) => {
  let answer: string | null = null;
  await page.route("**/api/owner", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.action).toBe("feedback");
      expect(body).not.toHaveProperty("takeoverId");
      answer = body.answer;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        dashboard: {
          ...dashboard,
          feedbackEligible: true,
          feedback: answer,
          active: false,
          replacedAt: owner.activatedAt + 3600000,
          previousOwnerName: "Paper Planes",
        },
      },
    });
  });
  await page.goto("/owner");
  const feedback = page.getByRole("region", { name: "Takeover feedback" });
  await feedback.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(
    feedback.getByRole("button", { name: "Yes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await feedback.getByRole("button", { name: "Not sure", exact: true }).click();
  await page.reload();
  await expect(feedback).toContainText("Your saved answer: Not sure.");
  await expect(page.getByText("You replaced", { exact: false })).toContainText(
    "Paper Planes",
  );
  await page.screenshot({
    path: `/tmp/owner-feedback-${info.project.name}.png`,
  });
});
test("a live wall with zero views explains its counters", async ({ page }) => {
  await wallFixture(page, 0);
  await page.goto("/");
  await expect(
    page.getByText(
      "This placement is live. Recorded views and clicks will appear here as they arrive.",
    ),
  ).toBeVisible();
  await expect(page.locator(".owner-ad h2")).toContainText("Raven Studio");
  await expect(page.getByText("No regional breakdown yet.")).toBeVisible();
});

test("replacement email shortcut opens a prefilled draft without creating a payment", async ({
  page,
}) => {
  await wallFixture(page);
  let repeats = 0,
    payments = 0;
  await page.route("**/api/checkout", (r) => {
    payments++;
    return r.fulfill({ status: 500, json: {} });
  });
  await page.route("**/api/owner", (r) => {
    const a = r.request().method() === "POST" ? r.request().postDataJSON() : {};
    if (a.action === "repeat") {
      repeats++;
      return r.fulfill({
        json: {
          draft: {
            contentType: "personal",
            displayName: "Raven Studio",
            description: "A little corner of the internet.",
            websiteUrl: "",
            logoUrl: "",
            uploadKey: "",
            buyerEmail: "owner@example.com",
            weeklyDigestEnabled: false,
          },
        },
      });
    }
    return r.fulfill({
      json: {
        dashboard: {
          ...dashboard,
          contentRevision: 0,
          active: false,
          replacedAt: Date.now(),
        },
      },
    });
  });
  await page.route("**/takeover/**/card*", (r) =>
    r.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/owner#token=" + "a".repeat(64) + "&retake=1");
  await expect(page).toHaveURL(/\/\?take=1$/);
  const dialog = page.getByRole("dialog", { name: "MAKE IT YOURS." });
  await expect(dialog.getByLabel("Display name")).toHaveValue("Raven Studio");
  await expect(dialog.getByLabel("Optional message")).toHaveValue(
    "A little corner of the internet.",
  );
  expect(repeats).toBe(1);
  expect(payments).toBe(0);
  await dialog.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" }).click();
  await expect(dialog.getByLabel("Buyer email")).toHaveValue(
    "owner@example.com",
  );

  await expect(
    dialog.getByRole("button", { name: "PAY $4.99 & TAKE THE WALL" }),
  ).toBeVisible();
  expect(payments).toBe(0);
});


test("wall designer saves independent device layouts and keeps controls outside the canvas", async ({ page }) => {
  const { designTemplate } = await import("../lib/wall-design");
  const design=JSON.stringify(designTemplate("poster","THE OWNER CANVAS","Between the stats"));
  await wallFixture(page,120,design);
  await page.addInitScript(() => sessionStorage.setItem("ttw-draft",JSON.stringify({contentType:"personal",category:"personal",displayName:"Canvas owner",description:"Welcome",websiteUrl:"",logoUrl:"",uploadKey:"",buyerEmail:"owner@example.com",requestKey:crypto.randomUUID()})));
  await page.goto("/?take=1");
  const wall=page.getByRole("region",{name:"Current owner"});
  await expect(wall.getByLabel("Owner designed wall")).toBeVisible();
  await expect(wall.getByRole("heading",{name:"THE OWNER CANVAS"})).toBeVisible();
  const dialog=page.getByRole("dialog",{name:"MAKE IT YOURS."});
  await dialog.getByRole("button",{name:"Design my wall",exact:true}).click();
  const designer=dialog.getByRole("region",{name:"Wall Designer"});
  await designer.getByRole("button",{name:"Add text",exact:true}).click();
  await designer.getByRole("textbox",{name:"Block text",exact:true}).fill("My movable message");
  await designer.getByLabel("Left %",{exact:true}).fill("14");
  await designer.getByLabel("Width %",{exact:true}).fill("60");
  const canvas=designer.locator(".designer-stage");
  const selected=canvas.locator(".canvas-block.selected");
  await selected.scrollIntoViewIfNeeded();
  const rect=(await selected.boundingBox())!;
  await page.mouse.move(rect.x+20,rect.y+20);await page.mouse.down();await page.mouse.move(rect.x+40,rect.y+30,{steps:3});await page.mouse.up();
  const desktopLeft=await designer.getByLabel("Left %",{exact:true}).inputValue();
  expect(Number(desktopLeft)).toBeGreaterThan(14);
  await designer.getByRole("button",{name:"Mobile canvas",exact:true}).click();
  await designer.getByLabel("Left %",{exact:true}).fill("4");
  await designer.getByRole("button",{name:"Desktop canvas",exact:true}).click();
  await expect(designer.getByLabel("Left %",{exact:true})).toHaveValue(desktopLeft);
  await canvas.screenshot({path:`/tmp/wall-designer-${test.info().project.name}.png`});
  const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("ttw-draft")!).canvasDesign);
  const parsed=JSON.parse(saved);expect(parsed.blocks.at(-1).mobile.x).toBe(4);
  await dialog.getByRole("button",{name:"PREVIEW YOUR TAKEOVER"}).click();
  await expect(dialog.getByLabel("Takeover preview").getByLabel("Owner designed wall")).toBeVisible();
  await expect(dialog.getByRole("button",{name:"PAY $4.99 & TAKE THE WALL"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

test("desktop designed wall fills available space and aligns with the stats", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Desktop flexible canvas layout");
  await page.setViewportSize({width:1440,height:1600});
  const { designTemplate }=await import("../lib/wall-design");
  await wallFixture(page,120,JSON.stringify(designTemplate("poster","FULL WALL","Edge to edge, inside the stats")));
  await page.goto("/");
  const surface=page.locator(".canvas-owner-ad .wall-canvas-surface");
  await expect(surface).toBeVisible();
  const bounds=await page.evaluate(()=>{
    const rect=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {x:r.x,right:r.right,height:r.height,y:r.y};};
    return {stats:rect(".site-metrics"),owner:rect(".owner-section"),canvas:rect(".canvas-owner-ad .wall-canvas-surface"),content:rect(".canvas-owner-ad .canvas-content")};
  });
  expect(Math.abs(bounds.canvas.x-bounds.stats.x)).toBeLessThan(1);
  expect(Math.abs(bounds.canvas.right-bounds.stats.right)).toBeLessThan(1);
  expect(Math.abs(bounds.canvas.height-(bounds.owner.height-24))).toBeLessThan(1);
  expect(bounds.canvas.height).toBeGreaterThan(560);
  expect(bounds.content.x-bounds.canvas.x).toBe(16);
  await page.screenshot({path:"/tmp/ttw-full-desktop-wall.png"});
});
