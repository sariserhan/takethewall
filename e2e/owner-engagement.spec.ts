import { test, expect, type BrowserContext } from "@playwright/test";
async function fixture(page: BrowserContext) {
  let owner = 1,
    enabled = true;
  let update = () => {};
  let communityEnabled = true,
    limit = 10;
  const entry = (n: number) => ({
    publicId: "ttw_" + String(n).padStart(32, "a"),
    name: "Poster " + n,
    description: "An independent project left its mark on the wall.",
    image: null,
    since: 1789185600000,
    until: 1789189200000,
  });
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
    const queries = new Map<number, string>();
    const value = (path: string): unknown => {
      if (path === "ama:current")
        return {
          answers: [
            {
              id: "question-1",
              question: "What are you building?",
              answer: "A small creative project.",
            },
          ],
        };
      if (path === "growth:visibility") return true;
      if (path === "community:controls")
        return {
          crumblingEnabled: communityEnabled,
          gazetteEnabled: communityEnabled,
          gazetteAuto: false,
          event: communityEnabled
            ? {
                enabled: true,
                title: "Friday Wall Hour",
                description: "Meet the makers.",
                start: Date.now() - 1000,
                end: Date.now() + 3600000,
              }
            : null,
        };
      if (path === "community:history")
        return communityEnabled
          ? {
              entries: Array.from({ length: limit === 10 ? 3 : 6 }, (_, i) =>
                entry(i + 1),
              ),
              next: limit === 10 ? 20 : null,
            }
          : null;
      if (path === "community:gazette")
        return communityEnabled
          ? {
              id: "issue",
              date: "2026-09-12",
              headline: "Indie projects take the wall",
              body: "A look at yesterday’s public placements.",
              status: "published",
              revision: 1,
              entries: [entry(1), entry(2)],
            }
          : null;
      if (path === "checkoutControls:state") return { paused: false };
      if (path === "wall:current")
        return {
          owner: {
            id: "owner-" + owner,
            contentType: "personal",
            linkType: "other",
            displayName: "Owner " + owner,
            takeoverNumber: owner,
            outboundLinkEnabled: false,
            websiteUrl: "",
            domain: "",
            description: "The current placement",
            logoUrl: null,
            activatedAt: Date.now() - 1000,
            activationSequence: owner,
            impressions: 10,
            uniqueVisitors: 5,
            clicks: 0,
            kind: "paid",
          },
          totalVisitors: 10,
          totalTakeovers: owner,
          visitorsToday: 10,
          utcDate: new Date().toISOString().slice(0, 10),
          regions: [],
          previousOwnerName: "Previous owner",
          demoStats: null,
          demoPresentation: null,
        };
      if (path === "hall:leaders")
        return enabled
          ? {
              ready: true,
              entries: [
                {
                  category: "reign",
                  publicId: "ttw_fixture",
                  name: "Record holder",
                  value: 3600000,
                },
                {
                  category: "referrals",
                  publicId: "ttw_fixture",
                  name: "Record holder",
                  value: 24,
                },
              ],
            }
          : null;
      return null;
    };
    const transition = (
      modifications: unknown[],
      querySet = version.querySet,
    ) => {
      const b = Buffer.alloc(8);
      b.writeBigUInt64LE(BigInt(++tick));
      const end = { ...version, querySet, ts: b.toString("base64") };
      socket.send(
        JSON.stringify({
          type: "Transition",
          startVersion: version,
          endVersion: end,
          modifications,
        }),
      );
      version = end;
    };
    const change = (queryId: number, path: string) => ({
      type: "QueryUpdated",
      queryId,
      value: value(path),
      logLines: [],
      journal: null,
    });
    update = () =>
      transition([...queries].map(([id, path]) => change(id, path)));
    socket.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type !== "ModifyQuerySet") return;
      transition(
        msg.modifications.map(
          (q: {
            type: string;
            queryId: number;
            udfPath: string;
            args?: { limit?: number }[];
          }) => {
            if (q.type === "Remove") {
              queries.delete(q.queryId);
              return { type: "QueryRemoved", queryId: q.queryId };
            }
            if (q.udfPath === "community:history")
              limit = q.args?.[0]?.limit ?? 10;
            queries.set(q.queryId, q.udfPath);
            return change(q.queryId, q.udfPath);
          },
        ),
        msg.newVersion,
      );
    });
  });
  return {
    hideCommunity: () => {
      communityEnabled = false;
      update();
    },
    changeOwner: () => {
      owner++;
      update();
    },
    hideHall: () => {
      enabled = false;
      update();
    },
  };
}
test("AMA accepts private questions and celebration templates stay editable", async ({
  page,
  context,
}) => {
  await fixture(context);
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/ama", (r) => {
    sent = r.request().postDataJSON();
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ask Owner 1 anything." }),
  ).toBeVisible();
  await page
    .getByLabel("Your question", { exact: true })
    .fill("How did you make it?");
  await page
    .getByRole("button", { name: "Ask the owner", exact: true })
    .click();
  await expect(
    page.getByText("Question sent privately.", { exact: false }),
  ).toBeVisible();
  expect(sent).toMatchObject({
    action: "ask",
    takeoverId: "owner-1",
    question: "How did you make it?",
  });
  await page.locator(".purchase-band button").click();
  const dialog = page.getByRole("dialog", { name: "MAKE IT YOURS." });
  await dialog.getByRole("button", { name: "Me / Message" }).click();
  await dialog
    .getByText("Start with a celebration template", { exact: true })
    .click();
  await dialog.getByRole("button", { name: "Birthday", exact: true }).click();
  await expect(dialog.getByLabel("Display name")).toHaveValue(
    "Happy birthday, Alex!",
  );
  await dialog.getByLabel("Display name").fill("Happy birthday, Sam!");
  await dialog.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" }).click();
  await expect(dialog.locator(".preview-creative h3")).toHaveText(
    "Happy birthday, Sam!",
  );
});
test("owner reviews private AMA questions and publishes an answer", async ({
  page,
  context,
}) => {
  await fixture(context);
  const inbox = {
    enabled: false,
    live: true,
    pending: [
      {
        id: "question-1",
        question: "What did you build?",
        answer: null as string | null,
      },
    ],
    answers: [] as { id: string; question: string; answer: string | null }[],
  };
  await page.route("**/api/owner", (r) =>
    r.fulfill({
      json: {
        dashboard: {
          owner: {
            id: "owner-1",
            displayName: "Owner 1",
            domain: "",
            description: "Hello",
            websiteUrl: "",
            contentType: "personal",
            logoUrl: null,
            takeoverNumber: 1,
            activatedAt: Date.now() - 1000,
            impressions: 10,
            uniqueVisitors: 5,
            clicks: 0,
          },
          active: true,
          publicId: "ttw_" + "a".repeat(32),
          replacedAt: null,
          regions: [],
          weeklyDigestEnabled: false,
          shareUrl: "https://takethewall.com/takeover/fixture",
          contentRevision: 0,
        },
      },
    }),
  );
  await page.route("**/api/ama", (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: inbox });
    const a = r.request().postDataJSON();
    if (a.action === "toggle") inbox.enabled = a.enabled;
    if (a.action === "answer") {
      inbox.answers.push({ ...inbox.pending[0], answer: a.answer });
      inbox.pending = [];
    }
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/owner");
  await page.getByLabel("Accept questions during this reign").click();
  await expect(
    page.getByLabel("Accept questions during this reign"),
  ).toBeChecked();
  await page.getByLabel("Your answer").fill("A creative studio.");
  await page
    .getByRole("button", { name: "Publish answer", exact: true })
    .click();
  await expect(
    page.getByText("A creative studio.", { exact: true }),
  ).toBeVisible();
  expect(inbox.answers).toHaveLength(1);
});
test("certificate renders recorded facts and has a printable layout", async ({
  page,
}, info) => {
  await page.goto("/takeover/ttw_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/certificate");
  await expect(
    page.getByRole("heading", { name: "Certificate of placement" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Happy birthday, Sam!" }),
  ).toBeVisible();
  await expect(page.locator(".certificate-facts p").filter({hasText:"Recorded unique visitors"})).toContainText("42");
  await page.screenshot({
    path: `/tmp/ttw-certificate-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".certificate-tools")).not.toBeVisible();
  if (info.project.name === "desktop")
    await page.pdf({
      path: "/tmp/ttw-certificate.pdf",
      format: "A4",
      printBackground: true,
    });
});
test("companion fallback opens a live mini-window", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await fixture(context);
  await page.addInitScript(() =>
    Object.defineProperty(window, "documentPictureInPicture", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/");
  const promise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Pop out wall" }).click();
  const popup = await promise;
  await expect(
    popup.getByRole("heading", { name: "Owner 1", exact: true }),
  ).toBeVisible();
  await popup.screenshot({ path: "/tmp/ttw-companion.png" });
  await popup.close();
});
test("native picture-in-picture renders the companion directly", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await fixture(context);
  await page.goto("/");
  test.skip(!(await page.evaluate(() => "documentPictureInPicture" in window)));
  const promise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Pop out wall" }).click();
  const popup = await promise;
  await expect(
    popup.getByRole("heading", { name: "Owner 1", exact: true }),
  ).toBeVisible();
  expect(await popup.locator("iframe").count()).toBe(0);
  await popup.close();
});
