import { test, expect, type Page } from "@playwright/test";
async function fixture(
  page: Page,
  reward: { status: string; outboundLinkEnabled: boolean },
) {
  const owner = 1;
  let update = () => {};
  await page.route("**/api/wall-vote**", (r) =>
    r.fulfill({ json: { choice: null } }),
  );
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
      if (path === "rewards:overview")
        return {
          currentNumber: 90,
          promotionEnabled: true,
          milestones: [100, 1000, 10000, 100000, 1000000].map((number) => ({
            number,
            rewardUsd: number,
            status: "future",
            candidateNumber: number,
            rulesVersion: "test",
            rulesHash: null,
            paidAt: null,
            snapshot: null,
            logoUrl: null,
            outboundLinkEnabled: false,
            sequence: [],
            performance: {
              rewardUsd: number,
              status: reward.status,
              candidateNumber: reward.status === "future" ? 0 : 42,
              cohortFrom: 1,
              cohortTo: number - 1,
              verifiedReferrals: 12,
              logoUrl: null,
              outboundLinkEnabled: reward.outboundLinkEnabled,
              snapshot: {
                displayName: "Referral winner fixture",
                description: "Winner content preserved here",
                websiteUrl: "https://example.com",
                contentType: "link",
                linkType: "website",
                domain: "example.com",
                impressions: 100,
                uniqueVisitors: 45,
                clicks: 6,
                activatedAt: 1,
                replacedAt: 1000,
                statsFrozen: true,
              },
            },
          })),
        };
      if (path === "whispers:history")
        return {
          page: [],
          isDone: true,
          continueCursor: "",
        };
      if (path === "whispers:messages" || path === "auditTrail:checkpoints")
        return [];
      if (path === "auditTrail:entries") return { entries: [], next: null };
      if (path === "auditTrail:verify")
        return { valid: true, next: null, reason: null };
      if (path === "wallVotes:totals")
        return {
          keep: 0,
          yeet: 0,
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
  return { refresh: () => update() };
}

test("Both prize paths link to separate permanent pages", async ({ page }) => {
  await fixture(page, { status: "future", outboundLinkEnabled: false });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "BRING THE MOST VISITORS" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Referral prize & permanent winner page →",
    }),
  ).toHaveAttribute("href", "/100/referral");
  for (const n of [100, 1000, 10000, 100000, 1000000]) {
    await expect(
      page
        .getByRole("navigation", { name: "Referral winner walls" })
        .locator(`a[href="/${n}/referral"]`),
    ).toHaveCount(1);
  }
  for (const n of [100, 1000, 10000, 100000, 1000000]) {
    await page.goto(`/${n}/referral`);
    await expect(
      page.getByRole("heading", {
        name: `$${n.toLocaleString("en-US")} REFERRAL WALL`,
      }),
    ).toBeVisible();
  }
  await page.goto("/99/referral");
  await expect(
    page.getByRole("heading", { name: /WRONG TURN/ }),
  ).toBeVisible();
});
test("Referral wall separates future, candidate, unawarded and paid content", async ({
  page,
}) => {
  const reward = { status: "future", outboundLinkEnabled: false };
  const state = await fixture(page, reward);
  await page.goto("/100/referral");
  await expect(
    page.getByRole("heading", { name: "$100 REFERRAL WALL" }),
  ).toBeVisible();
  await expect(
    page.getByText("Referral winner fixture", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("NO CONFIRMED WINNER YET", { exact: true }),
  ).toBeVisible();
  reward.status = "under_review";
  state.refresh();
  await expect(
    page.getByText(/Provisional recipient: takeover #42/),
  ).toBeVisible();
  await expect(
    page.getByText("Referral winner fixture", { exact: true }),
  ).toHaveCount(0);
  reward.status = "unawarded";
  state.refresh();
  await expect(page.getByText("NO WINNER", { exact: true })).toBeVisible();
  await expect(page.getByText(/Provisional recipient/)).toHaveCount(0);
  reward.status = "paid";
  state.refresh();
  await expect(
    page.getByRole("heading", { name: "Referral winner fixture" }),
  ).toBeVisible();
  await expect(page.getByText("Winner content preserved here")).toBeVisible();
  await expect(page.getByRole("link", { name: "Visit winner" })).toHaveCount(0);
  reward.outboundLinkEnabled = true;
  state.refresh();
  await expect(
    page.getByRole("link", { name: "Visit winner" }),
  ).toHaveAttribute("href", "https://example.com");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
