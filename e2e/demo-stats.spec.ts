import { test, expect } from "@playwright/test";

test("sample traffic stays visibly labeled and never replaces real takeover counts", async ({ page }) => {
  const wallQueryIds = new Set<number>();
  await page.route("**/api/context", route => route.fulfill({status: 503, body: ""}));
  await page.routeWebSocket(/convex.*\/sync/, socket => {
    const server = socket.connectToServer();
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw));
      for (const change of message.modifications ?? []) {
        if (change.type === "Add" && change.udfPath === "wall:current") wallQueryIds.add(change.queryId);
      }
      server.send(raw);
    });
    server.onMessage(raw => {
      const message = JSON.parse(String(raw));
      for (const change of message.modifications ?? []) {
        if (change.type === "QueryUpdated" && wallQueryIds.has(change.queryId)) {
          change.value = {
            owner: {id:"demo_owner_browser_fixture",contentType:"personal",linkType:"other",displayName:"Demo preview",takeoverNumber:null,outboundLinkEnabled:false,websiteUrl:"",domain:"",description:"Labeled sample data",logoUrl:null,activatedAt:1789185600000,activationSequence:0,impressions:0,uniqueVisitors:0,clicks:0,kind:"initial_house"},
            totalVisitors:0,totalTakeovers:0,visitorsToday:0,utcDate:"2026-09-12",regions:[],previousOwnerName:null,
            demoStats:{visitorsToday:120,totalVisitors:500,impressions:240,uniqueVisitors:120,clicks:24},
          };
        }
      }
      socket.send(JSON.stringify(message));
    });
  });
  await page.goto("/");
  await expect(page.locator(".demo-notice")).toContainText("not measured traffic");
  await expect(page.locator(".demo-badge")).toHaveCount(6);
  const metric = (label:string) => page.locator(".metric").filter({has:page.locator("span",{hasText:label})});
  await expect(metric("TOTAL VISITORS")).toContainText("500");
  await expect(metric("COUNTED TAKEOVERS").locator("strong")).toHaveText("0");
  await expect(metric("COUNTED TAKEOVERS").locator(".demo-badge")).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/demo-stats-${test.info().project.name}.png`,fullPage:true});
});
