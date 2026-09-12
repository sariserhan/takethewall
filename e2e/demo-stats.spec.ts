import { test, expect } from "@playwright/test";

for (const extended of [false, true]) {
  test(`sample traffic stays labeled (extended preview: ${extended})`, async ({
    page,
  }) => {
    const wallQueryIds = new Set<number>();
    await page.route("**/api/context", (route) =>
      route.fulfill({ status: 503, body: "" }),
    );
    await page.routeWebSocket(/convex.*\/sync/, (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((raw) => {
        const message = JSON.parse(String(raw));
        for (const change of message.modifications ?? []) {
          if (change.type === "Add" && change.udfPath === "wall:current")
            wallQueryIds.add(change.queryId);
        }
        server.send(raw);
      });
      server.onMessage((raw) => {
        const message = JSON.parse(String(raw));
        for (const change of message.modifications ?? []) {
          if (
            change.type === "QueryUpdated" &&
            wallQueryIds.has(change.queryId)
          ) {
            change.value = {
              owner: {
                id: "demo_owner_browser_fixture",
                contentType: "personal",
                linkType: "other",
                displayName: "Demo preview",
                takeoverNumber: null,
                outboundLinkEnabled: false,
                websiteUrl: "",
                domain: "",
                description: "Labeled sample data",
                logoUrl: null,
                activatedAt: 1789185600000,
                activationSequence: 0,
                impressions: 10,
                uniqueVisitors: 10,
                clicks: 1,
                kind: "initial_house",
              },
              totalVisitors: 10,
              totalTakeovers: 10,
              visitorsToday: 10,
              utcDate: "2026-09-12",
              regions: [],
              previousOwnerName: null,
              demoPresentation: extended
                ? {
                    displayName: "Preview owner only",
                    description: "Sample presentation",
                    websiteUrl: "https://example.com/",
                    ownerSince: 1789185500000,
                    previousOwnerName: "Preview predecessor",
                    takeoverCount: 73,
                  }
                : null,
              demoStats: {
                visitorsToday: 120,
                totalVisitors: 500,
                impressions: 240,
                uniqueVisitors: 120,
                clicks: 24,
              },
            };
          }
        }
        socket.send(JSON.stringify(message));
      });
    });
    await page.goto("/");
    await expect(page.locator(".demo-notice")).toContainText(
      extended ? "DEMO PREVIEW" : "not measured traffic",
    );
    await expect(page.locator(".demo-badge")).toHaveCount(extended ? 10 : 6);
    const metric = (label: string) =>
      page
        .locator(".metric")
        .filter({ has: page.locator("span", { hasText: label }) });
    await expect(metric("TOTAL VISITORS")).toContainText("510");
    await expect(metric("COUNTED TAKEOVERS").locator("strong")).toHaveText(
      extended ? "83" : "10",
    );
    await expect(
      metric("COUNTED TAKEOVERS").locator(".demo-badge"),
    ).toHaveCount(extended ? 1 : 0);
    await expect(metric("TOTAL VISITORS").locator(".demo-badge")).toHaveText("Includes-demo");
    await expect(page.locator(".demo-breakdown")).toHaveCount(0);
    await expect(metric("IMPRESSIONS").locator("strong")).toHaveText("250");
    await expect(metric("CLICKS").locator("strong")).toHaveText("25");
    await expect(metric("CTR").locator("strong")).toHaveText("10%");
    if (extended) {
      await expect(page.locator(".demo-owner")).toContainText(
        "Preview owner only",
      );
      await expect(page.locator(".demo-progress-notice")).toContainText(
        "No number is reserved",
      );
      await expect(page.locator(".owner-since")).toContainText("UTC");
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/demo-stats-${test.info().project.name}.png`,
      fullPage: false,
    });
  });
}
