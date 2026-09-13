import { test, expect, type Page } from "@playwright/test";
async function fixture(page: Page) {
  let owner = 1,
    enabled = true;
  let update = () => {};
  const choices = new Map<number, "keep" | "yeet">();
  await page.route("**/api/wall-vote**", async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { choice: choices.get(owner) ?? null } });
    const a = r.request().postDataJSON();
    expect(a.takeoverId).toBe("owner-" + owner);
    choices.set(owner, a.choice);
    await r.fulfill({ json: { choice: a.choice } });
    update();
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
      if (path === "wallVotes:totals")
        return {
          keep: choices.get(owner) === "keep" ? 1 : 0,
          yeet: choices.get(owner) === "yeet" ? 1 : 0,
        };
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
test("Keep or Yeet updates one vote, survives refresh, and resets for the next owner", async ({
  page,
}, info) => {
  const state = await fixture(page);
  let purchases = 0;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/checkout", (r) => {
    purchases++;
    return r.fulfill({ status: 500, json: {} });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => { document.documentElement.dataset.sharedUrl = data.url; } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Share wall", exact: true }).click();
  expect(await page.locator("html").getAttribute("data-shared-url")).toBe(new URL("/", page.url()).href);
  const tools = page.locator(".wall-tools");
  const heights = await tools.locator("button:visible").evaluateAll(buttons => buttons.map(b => b.getBoundingClientRect().height));
  expect(heights).toEqual(heights.map(() => 44));
  expect(heights[0]).toBeGreaterThanOrEqual(44);
  if (await page.evaluate(() => document.fullscreenEnabled)) {
    await tools.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await expect(tools.getByRole("button", { name: "Exit fullscreen", exact: true })).toHaveAttribute("aria-pressed", "true");
    await tools.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
    await expect(tools.getByRole("button", { name: "Fullscreen", exact: true })).toHaveAttribute("aria-pressed", "false");
  }
  const section = page.locator(".keep-or-yeet");
  await expect(
    section.getByRole("heading", { name: "KEEP OR YEET?" }),
  ).toBeVisible();
  await expect(section).toContainText("0 votes");
  await section.getByRole("button", { name: /^KEEP/ }).click();
  await expect(
    section.getByRole("button", { name: "KEEP · 100%" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(section).toContainText("1 vote");
  await section.getByRole("button", { name: /^YEET/ }).click();
  await expect(
    section.getByRole("button", { name: "YEET · 100%" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(section).toContainText("1 vote");
  await page.reload();
  await expect(section.getByRole("button", { name: /^YEET/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await section.screenshot({ path: `/tmp/ttw-votes-${info.project.name}.png` });
  await expect(page.locator(".purchase-band .price")).toHaveText("$4.99");
  expect(purchases).toBe(0);
  state.changeOwner();
  await expect(section).toContainText("0 votes");
  await expect(section.getByRole("button", { name: /^KEEP/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(section.getByRole("button", { name: /^YEET/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
