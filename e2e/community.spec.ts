import { test, expect, type Page } from "@playwright/test";
async function fixture(page: Page) {
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
test("community sections load more without duplicates and disappear when disabled", async ({
  page,
}, info) => {
  const state = await fixture(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const wall = page.locator(".crumbling-wall");
  await expect(
    wall.getByRole("heading", { name: "THE CRUMBLING WALL" }),
  ).toBeVisible();
  await expect(wall.locator("article")).toHaveCount(3);
  await wall.getByRole("button", { name: "Load older posters" }).click();
  await expect(wall.locator("article")).toHaveCount(6);
  await expect(
    page.getByRole("heading", { name: "Indie projects take the wall" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Friday Wall Hour" }),
  ).toBeVisible();
  await wall.screenshot({
    path: `/tmp/ttw-crumbling-${info.project.name}.png`,
  });
  await page
    .locator(".wall-gazette")
    .screenshot({ path: `/tmp/ttw-gazette-${info.project.name}.png` });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  state.hideCommunity();
  await expect(wall).toHaveCount(0);
  await expect(page.locator(".wall-gazette")).toHaveCount(0);
  await expect(page.getByLabel("Community hour")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("terminal shows public state and prepares checkout without a charge", async ({
  page,
}, info) => {
  await fixture(page);
  let payments = 0;
  await page.route("**/api/checkout", (r) => {
    payments++;
    return r.fulfill({ status: 500, json: {} });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Owner 1", exact: true }),
  ).toBeVisible();
  if (info.project.name === "desktop") await page.keyboard.press("Control+k");
  else await page.getByRole("button", { name: /Terminal Ctrl K/ }).click();
  const terminal = page.getByRole("dialog", { name: "WALL TERMINAL" });
  await expect(terminal).toBeVisible();
  await terminal.getByLabel("Command", { exact: true }).fill("stats");
  await terminal.getByRole("button", { name: "Run", exact: true }).click();
  await expect(terminal.getByLabel("Terminal output")).toContainText(
    '"name":"Owner 1"',
  );
  await terminal
    .getByLabel("Command", { exact: true })
    .fill('eval("alert(1)")');
  await terminal.getByRole("button", { name: "Run", exact: true }).click();
  await expect(terminal.getByRole("alert")).toHaveText(
    "Unknown command. Type help.",
  );
  await terminal.screenshot({
    path: `/tmp/ttw-terminal-${info.project.name}.png`,
  });
  await terminal
    .getByLabel("Command", { exact: true })
    .fill('take --title "Terminal Studio" --url "https://example.com" --pay');
  await terminal.getByRole("button", { name: "Run", exact: true }).click();
  const checkout = page.getByRole("dialog", { name: "MAKE IT YOURS." });
  await expect(checkout).toBeVisible();
  await expect(terminal).not.toBeVisible();
  await expect(checkout.getByLabel("Display name")).toHaveValue(
    "Terminal Studio",
  );
  expect(payments).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
