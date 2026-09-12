import { test, expect } from "@playwright/test";

test("numbering offset is disclosed with owner #16 and progress 16", async ({
  page,
}) => {
  const queries = new Map<number, string>();
  await page.route("**/api/context", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.routeWebSocket(/convex.*\/sync/, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      for (const change of message.modifications ?? [])
        if (change.type === "Add") queries.set(change.queryId, change.udfPath);
      server.send(raw);
    });
    server.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      for (const change of message.modifications ?? []) {
        if (change.type !== "QueryUpdated") continue;
        if (queries.get(change.queryId) === "wall:current")
          change.value = {
            owner: {
              id: "numbering_fixture",
              contentType: "personal",
              linkType: "other",
              displayName: "Current owner",
              takeoverNumber: 16,
              outboundLinkEnabled: false,
              websiteUrl: "",
              domain: "",
              description: "One recorded takeover",
              logoUrl: null,
              activatedAt: 1789185600000,
              activationSequence: 1,
              impressions: 1,
              uniqueVisitors: 1,
              clicks: 0,
              kind: "paid",
            },
            totalVisitors: 1,
            totalTakeovers: 16,
            numberingOffset: 15,
            visitorsToday: 1,
            utcDate: "2026-09-12",
            regions: [],
            previousOwnerName: "House placement",
            demoPresentation: null,
            demoStats: null,
          };
        if (queries.get(change.queryId) === "rewards:overview")
          change.value = {
            currentNumber: 16,
            numberingOffset: 15,
            promotionEnabled: true,
            milestones: [
              {
                number: 100,
                rewardUsd: 100,
                status: "future",
                candidateNumber: 100,
                rulesVersion: "2026-09-12.1",
                rulesHash: null,
                paidAt: null,
                snapshot: null,
                logoUrl: null,
                outboundLinkEnabled: false,
                sequence: [],
              },
            ],
          };
      }
      socket.send(JSON.stringify(message));
    });
  });
  await page.goto("/");
  await expect(page.locator(".owner-section > .eyebrow").first()).toContainText("#16");
  const total = page
    .locator(".site-metrics .metric")
    .filter({
      has: page.getByRole("button", { name: "COUNTED TAKEOVERS", exact: true }),
    });
  await expect(total.locator(":scope > strong")).toContainText("16");
  await expect(page.locator(".prize-explainer .numbering-note")).toContainText(
    "not a set of completed takeovers",
  );
  await expect(page.locator(".prize-next")).toContainText("84 to go");
  await page.goto("/100");
  await expect(page.locator(".permanent-count strong")).toHaveText("16");
  await expect(page.locator(".numbering-note")).toContainText(
    "no owner or payment records",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
