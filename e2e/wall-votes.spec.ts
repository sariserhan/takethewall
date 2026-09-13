import AxeBuilder from "@axe-core/playwright";
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
      if (path === "whispers:messages" || path === "auditTrail:checkpoints") return [];
      if (path === "auditTrail:entries") return { entries: [], next: null };
      if (path === "auditTrail:verify") return { valid: true, next: null, reason: null };
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

test("wall lab tools work without changing the owner", async ({page}, info) => {
 await fixture(page);
 const errors: string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/");
 const tools=page.locator(".wall-tools");
 await tools.getByRole("button",{name:/Theme/}).click();
 await expect(page.locator("html")).toHaveAttribute("data-wall-theme","obsidian");
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:`/tmp/ttw-obsidian-${info.project.name}.png`});
 const contrast=await new AxeBuilder({page}).withRules(["color-contrast"]).analyze();
 expect(contrast.violations.flatMap(v=>v.nodes.map(n=>({html:n.html,summary:n.failureSummary})))).toEqual([]);
 await page.reload();
 await expect(page.locator("html")).toHaveAttribute("data-wall-theme","obsidian");
 await tools.getByRole("button",{name:/Retro/}).click();
 await expect(page.locator("html")).toHaveAttribute("data-wall-retro","on");
 expect(await page.evaluate(()=>getComputedStyle(document.body,"::before").content)).toContain("RETRO MODE");
 expect(await page.evaluate(()=>getComputedStyle(document.body,"::after").position)).toBe("fixed");
 await page.screenshot({path:`/tmp/ttw-retro-${info.project.name}.png`});
 await expect(tools.getByRole("button",{name:/X-Ray/})).toHaveCount(0);
 for(const name of ["Globe","Audit","Whisper","QR Code","Shatter","Snapshot"]){
   await tools.getByRole("button",{name:new RegExp(name)}).click();
   const dialog=page.getByRole("dialog",{name,exact:true});await expect(dialog).toBeVisible();
   if(name==="Globe") await expect(dialog.locator(".earth-country")).toHaveCount(177);
   if(name==="Whisper") await expect(dialog.getByText("No whispers yet. Start the conversation.")).toBeVisible();
   if(name==="Audit") await expect(dialog.getByRole("heading",{name:"Chain records"})).toBeVisible();
   if(name==="Audit") await expect(dialog.getByText("Image dimensions",{exact:true})).toBeVisible();
   if(name==="QR Code")await expect(dialog.getByAltText("Scan to open takeover checkout")).toBeVisible();
   if(name==="Shatter"){
     const canvas=dialog.locator("canvas");await expect(dialog.getByRole("button",{name:"Rebuild",exact:true})).toBeVisible();
     const first=await canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL());
     await expect.poll(()=>canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL())).not.toBe(first);
     await dialog.getByRole("button",{name:"Rebuild",exact:true}).click();await expect(canvas).toHaveAttribute("aria-label","Wall brick playground");
   }
   if(name==="Snapshot"){await expect(dialog.getByRole("link",{name:"Download PNG"})).toBeVisible();const download=page.waitForEvent("download");await dialog.getByRole("link",{name:"Download PNG"}).click();expect((await download).suggestedFilename()).toBe("take-the-wall-snapshot.png");}
   if(name==="Globe" || name==="Snapshot") await dialog.screenshot({path:`/tmp/ttw-lab-${name}-${info.project.name}.png`});
   await dialog.getByRole("button",{name:"Close dialog",exact:true}).click();
 }
 await tools.getByRole("button",{name:/Retro/}).click();
 await tools.getByRole("button",{name:/Theme/}).click();
 await expect(page.locator("html")).toHaveAttribute("data-wall-theme","paper");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 expect(errors).toEqual([]);
});

test("Freeze holds the displayed wall and Thaw catches up to the latest owner", async ({page}, info) => {
 const state=await fixture(page);
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/");
 await page.locator(".wall-tools").getByRole("button",{name:"Freeze",exact:true}).click();
 const snapshot=page.locator(".cryo-snapshot");
 await expect(snapshot).toBeVisible();
 await expect(snapshot).toHaveAttribute("inert","");
 await expect(page.getByRole("dialog",{name:"Frozen wall view"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Thaw — return to live"})).toBeFocused();
 const captured=await snapshot.innerText();
 await page.keyboard.press("Control+k");
 await expect(page.locator("dialog[open]")).toHaveCount(0);
 state.changeOwner();
 await expect(page.locator(".wall-page:not(.cryo-snapshot) .owner-ad")).toContainText("Owner 2");
 expect(await snapshot.innerText()).toBe(captured);
 await page.screenshot({path:`/tmp/ttw-freeze-${info.project.name}.png`});
 await page.getByRole("button",{name:"Thaw — return to live"}).click();
 await expect(snapshot).toHaveCount(0);
 await expect(page.locator(".owner-ad")).toContainText("Owner 2");
 await expect(page.locator(".owner-ad")).toBeVisible();
 await expect(page.locator(".wall-tools").getByRole("button",{name:"Freeze",exact:true})).toBeFocused();
 await page.locator(".wall-tools").getByRole("button",{name:"Freeze",exact:true}).click();
 await page.keyboard.press("Escape");
 await expect(snapshot).toHaveCount(0);
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.locator(".wall-tools").getByRole("button",{name:"Freeze",exact:true}).click();
 expect(await page.locator(".cryo-ice").evaluate(el=>getComputedStyle(el).animationName)).toBe("none");
 await page.keyboard.press("Escape");
 expect(errors).toEqual([]);
});
