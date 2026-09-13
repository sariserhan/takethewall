import { test, expect } from "@playwright/test";
test("homepage requests summaries and milestone navigation requests only that wall", async ({
  page,
}) => {
  const calls: Record<string, unknown>[] = [];
  await page.route("**/api/context", (r) =>
    r.fulfill({ status: 503, body: "" }),
  );
  await page.routeWebSocket(/convex.*\/sync/, (socket) => {
    let version = {
        querySet: 0,
        identity: 0,
        ts: Buffer.alloc(8).toString("base64"),
      },
      tick = 0;
    const value = (path: string, args: Record<string, unknown>) => {
      if (path === "checkoutControls:state") return { paused: false };
      if (path === "wall:current")
        return {
          owner: {
            id: "fixture",
            contentType: "personal",
            linkType: "other",
            displayName: "A test owner",
            takeoverNumber: 16,
            outboundLinkEnabled: false,
            websiteUrl: "",
            domain: "",
            description: "A project on the wall",
            logoUrl: null,
            activatedAt: 1789185600000,
            activationSequence: 1,
            impressions: 128,
            uniqueVisitors: 100,
            clicks: 0,
            kind: "paid",
          },
          totalVisitors: 100,
          totalTakeovers: 16,
          numberingOffset: 15,
          visitorsToday: 100,
          utcDate: "2026-09-14",
          regions: [],
          previousOwnerName: "Previous project",
          demoStats: null,
          demoPresentation: null,
        };
      if (path === "rewards:overview") {
        calls.push(args);
        return {
          currentNumber: 16,
          numberingOffset: 15,
          promotionEnabled: true,
          milestones: [100, 1000, 10000, 100000, 1000000]
            .filter((n) => args.number === undefined || args.number === n)
            .map((n) => ({
              number: n,
              rewardUsd: n,
              status: "future",
              candidateNumber: n,
              rulesVersion: "test",
              rulesHash: null,
              paidAt: null,
              snapshot: null,
              logoUrl: null,
              outboundLinkEnabled: false,
              sequence: [],
            })),
        };
      }
      return null;
    };
    socket.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type !== "ModifyQuerySet") return;
      const ts = Buffer.alloc(8);
      ts.writeBigUInt64LE(BigInt(++tick));
      const end = {
        ...version,
        querySet: msg.newVersion,
        ts: ts.toString("base64"),
      };
      const modifications = msg.modifications.map(
        (q: {
          type: string;
          queryId: number;
          udfPath: string;
          args: Record<string, unknown>[];
        }) =>
          q.type === "Remove"
            ? { type: "QueryRemoved", queryId: q.queryId }
            : {
                type: "QueryUpdated",
                queryId: q.queryId,
                value: value(q.udfPath, q.args[0]),
                logLines: [],
                journal: null,
              },
      );
      socket.send(
        JSON.stringify({
          type: "Transition",
          startVersion: version,
          endVersion: end,
          modifications,
        }),
      );
      version = end;
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A test owner" }),
  ).toBeVisible();
  await expect(page.locator(".prize-milestones a")).toHaveCount(5);
  expect(calls).toEqual([{ summary: true }]);
  await page.locator('.prize-milestones a[href="/100"]').click();
  await expect(
    page.getByRole("heading", { name: "THE $100 WALL", exact: true }),
  ).toBeVisible();
  expect(calls.at(-1)).toEqual({ number: 100 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
