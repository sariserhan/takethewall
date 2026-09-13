import { test, expect, type Page } from "@playwright/test";
async function fixture(page: Page) {
  let owner = 1,
    enabled = true;
  let update = () => {};
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
          (q: { type: string; queryId: number; udfPath: string }) => {
            if (q.type === "Remove") {
              queries.delete(q.queryId);
              return { type: "QueryRemoved", queryId: q.queryId };
            }
            queries.set(q.queryId, q.udfPath);
            return change(q.queryId, q.udfPath);
          },
        ),
        msg.newVersion,
      );
    });
  });
  return {
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
test("live notification and opt-in sound do not announce initial load; hall visibility updates live", async ({
  page,
}) => {
  const control = await fixture(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Owner 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("THE WALL WAS JUST TAKEN", { exact: true }),
  ).toHaveCount(0);
  const sound = page.getByRole("button", { name: "Sound off", exact: true });
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => document.fonts.ready);
  await sound.click();
  await expect(
    page.getByRole("button", { name: "Sound on", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  control.changeOwner();
  await expect(
    page.getByText("THE WALL WAS JUST TAKEN", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Owner 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "HALL OF FAME", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Longest completed reign", { exact: true }),
  ).toBeVisible();
  await page
    .locator("#hall-of-fame")
    .screenshot({ path: `/tmp/ttw-hall-${test.info().project.name}.png` });
  control.hideHall();
  await expect(
    page.getByRole("heading", { name: "HALL OF FAME", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("mobile quick purchase appears off-screen and disappears for dialogs", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await fixture(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Owner 1", exact: true }),
  ).toBeVisible();
  await page.locator(".purchase-band button").scrollIntoViewIfNeeded();
  await expect(page.getByLabel("Quick takeover", { exact: true })).toHaveCount(
    0,
  );
  await page.locator(".public-footer").scrollIntoViewIfNeeded();
  const bar = page.getByLabel("Quick takeover", { exact: true });
  await expect(bar).toBeVisible();
  await page.screenshot({ path: "/tmp/ttw-mobile-purchase.png" });
  await bar.getByRole("button").click();
  await expect(
    page.getByRole("dialog", { name: "MAKE IT YOURS." }),
  ).toBeVisible();
  await expect(bar).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(bar).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
