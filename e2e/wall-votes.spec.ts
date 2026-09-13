import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
async function fixture(page: Page) {
  let owner = 1,
    enabled = true;
  let update = () => {};
  const choices = new Map<number, "keep" | "yeet">();
  const whispers = new Map<number, { id: string; text: string; createdAt: number }[]>();
  await page.route("**/api/whisper", async r => {
    const a = r.request().postDataJSON();
    expect(a.takeoverId).toBe("owner-" + owner);
    const rows = whispers.get(owner) ?? [];
    whispers.set(owner, [{id:"message-" + Date.now(),text:a.text,createdAt:Date.now()}, ...rows]);
    await r.fulfill({json:{ok:true}}); update();
  });
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
      if (path === "whispers:history") return { page: whispers.get(owner) ?? [], isDone: true, continueCursor: "" };
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
            shareVisitors: owner === 1 ? 12 : 0,
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
    seedWhispers: () => { whispers.set(owner, [4,3,2,1].map(i=>({id:"msg-"+i,text:"Message "+i,createdAt:Date.now()-i*1000}))); update(); },
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
 const notifyButtons=page.locator(".wall-follow .milestone-alert-signup > button");
 for(let i=0;i<await notifyButtons.count();i++){
   await notifyButtons.nth(i).hover();
   await expect(notifyButtons.nth(i)).toHaveCSS("color","rgb(17, 17, 15)");
   const hoverContrast=await new AxeBuilder({page}).include(".wall-follow").withRules(["color-contrast"]).analyze();
   expect(hoverContrast.violations).toEqual([]);
 }
 const contrast=await new AxeBuilder({page}).withRules(["color-contrast"]).analyze();
 expect(contrast.violations.flatMap(v=>v.nodes.map(n=>({html:n.html,summary:n.failureSummary})))).toEqual([]);
 await page.reload();
 await expect(page.locator("html")).toHaveAttribute("data-wall-theme","obsidian");
 await page.locator(".experiments-menu").click();
 await tools.getByRole("button",{name:"Decade Warp",exact:true}).click();
 await page.getByRole("button",{name:"2077 · Neon future",exact:true}).click();
 await page.keyboard.press("Escape");
 await expect(page.locator("html")).toHaveAttribute("data-wall-retro","on");
 expect(await page.evaluate(()=>getComputedStyle(document.body,"::before").content)).toContain("RETRO MODE");
 expect(await page.evaluate(()=>getComputedStyle(document.body,"::after").position)).toBe("fixed");
 await page.screenshot({path:`/tmp/ttw-retro-${info.project.name}.png`});
 await expect(tools.getByRole("button",{name:/X-Ray/})).toHaveCount(0);
 for(const name of ["Globe","Audit","QR Code","Shatter","Snapshot"]){
   await tools.getByRole("button",{name:new RegExp(name)}).click();
   const dialog=page.getByRole("dialog",{name,exact:true});await expect(dialog).toBeVisible();
   if(name==="Globe") await expect(dialog.locator(".earth-country")).toHaveCount(177);
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
 await tools.getByRole("button",{name:"Decade Warp",exact:true}).click();
 await page.getByRole("button",{name:"Present day",exact:true}).click();
 await page.keyboard.press("Escape");
 await tools.getByRole("button",{name:/Theme/}).click();
 await expect(page.locator("html")).toHaveAttribute("data-wall-theme","paper");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 expect(errors).toEqual([]);
});

test("Freeze holds the displayed wall and Thaw catches up to the latest owner", async ({page}, info) => {
 const state=await fixture(page);
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/");
 await page.locator(".experiments-menu").click();
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

test("Wall experiments work and the magnetic title is always enabled", async ({page}, info) => {
 await fixture(page);
 await page.route("**/api/pulse",r=>r.fulfill({json:{status:200,elapsedMs:42,checkedAt:Date.now(),tlsVerified:true,outcome:"responded"}}));
 await page.goto("/");
 await page.getByRole("button",{name:"Try Mine",exact:true}).click();
 await page.getByLabel("Your title",{exact:true}).fill("My launch");
 await page.getByLabel("Your website",{exact:true}).fill("https://my-launch.com");
 await expect(page.locator(".try-mine h2")).toHaveText("My launch");
 await expect(page.locator(".try-mine")).toContainText("ONLY YOU SEE THIS");
 await page.screenshot({path:`/tmp/ttw-try-mine-${info.project.name}.png`,fullPage:true});
 await page.getByRole("button",{name:/Continue to checkout/}).click();
 await expect(page.getByRole("dialog")).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem("ttw-draft")!).displayName)).toBe("My launch");
 await expect(page.getByRole("dialog").getByLabel(/Display name/)).toHaveValue("My launch");
 await expect(page.getByRole("dialog").getByLabel("Website URL",{exact:true})).toHaveValue("https://my-launch.com/");
 await page.keyboard.press("Escape");
 await page.locator(".experiments-menu").click();
 await expect(page.locator(".experiments-menu").getByRole("button",{name:"Pulse",exact:true})).toHaveCount(0);
 await expect(page.locator(".wall-tools > .experiments-menu")).toHaveText("Playground");
 await page.getByRole("button",{name:"Hold",exact:true}).click();
 const pad=page.getByRole("button",{name:"PRESS & HOLD"});
 await pad.focus(); await page.keyboard.down("Space");
 await expect(page.locator(".hold-pad")).toHaveAttribute("aria-pressed","true");
 await page.waitForTimeout(250); await page.keyboard.up("Space");
 await expect(page.locator(".hold-pad")).toHaveAttribute("aria-pressed","false");
 expect(Number(await page.evaluate(()=>localStorage.getItem("ttw-hold-best")))).toBeGreaterThan(100);
 await page.keyboard.press("Escape");
 await page.getByRole("button",{name:"Pulse",exact:true}).click();
 await page.getByRole("button",{name:"Check website",exact:true}).click();
 await expect(page.getByRole("dialog")).toContainText("HTTP 200");
 await expect(page.getByRole("dialog")).toContainText("42 ms");
 await page.keyboard.press("Escape");
 await expect(page.getByRole("button",{name:"Magnet",exact:true})).toHaveCount(0);
 if(info.project.name==="desktop") {
   const letter=page.locator(".magnetic-title span").nth(2);
   await letter.hover();
   await expect.poll(()=>letter.evaluate(el=>el.style.transform)).not.toBe("");
 }
 await page.getByRole("button",{name:"Rave",exact:true}).click();
 await expect(page.locator("html")).toHaveAttribute("data-wall-rave","on");
 await expect(page.getByRole("button",{name:"Rave beat off",exact:true})).toHaveAttribute("aria-pressed","false");
 await page.getByRole("button",{name:"Rave beat off",exact:true}).click();
 await expect(page.getByRole("button",{name:"Rave beat on",exact:true})).toHaveAttribute("aria-pressed","true");
 await page.emulateMedia({reducedMotion:"reduce"});
 expect(await page.locator(".wall-page").evaluate(el=>getComputedStyle(el,"::before").animationName)).toBe("none");
 await page.getByRole("button",{name:"Rave",exact:true}).click();
 await expect(page.locator("html")).toHaveAttribute("data-wall-rave","off");
 await expect(page.getByRole("button",{name:/Rave beat/})).toHaveCount(0);
});

test("Whisper previews the latest three messages below voting and resets with the owner", async ({page}, info) => {
 const state=await fixture(page); state.seedWhispers(); await page.goto("/");
 const preview=page.locator(".whisper-preview");
 await expect(page.locator(".keep-or-yeet + .whisper-preview")).toBeVisible();
 await expect(preview.getByRole("heading",{name:"Whispers about Owner 1"})).toBeVisible();
 await expect(preview.locator(".whisper-log > p")).toHaveCount(3);
 await expect(preview.locator(".whisper-log")).not.toContainText("Message 1");
 await expect(page.locator(".wall-tools").getByRole("button",{name:"Whisper",exact:true})).toHaveCount(0);
 await preview.getByRole("button",{name:"View conversation"}).click();
 const dialog=page.getByRole("dialog",{name:"Whispers about Owner 1",exact:true});
 await expect(dialog.locator(".whisper-log > p")).toHaveCount(4);
 await expect(dialog.locator(".whisper-log")).toContainText("Message 1");
 await page.keyboard.press("Escape");
 await preview.getByLabel("Your whisper",{exact:true}).fill("Great launch!");
 await preview.getByRole("button",{name:"Send whisper",exact:true}).click();
 await expect(preview.locator(".whisper-log")).toContainText("Great launch!");
 await expect(preview.locator(".whisper-log > p")).toHaveCount(3);
 await preview.screenshot({path:`/tmp/ttw-whisper-inline-${info.project.name}.png`});
 await page.getByRole("button",{name:"Theme",exact:true}).click();
 const contrast=await new AxeBuilder({page}).include(".whisper-preview").withRules(["color-contrast"]).analyze();
 expect(contrast.violations).toEqual([]);
 await preview.getByRole("button",{name:"View conversation"}).click();
 state.changeOwner();
 await expect(page.getByRole("dialog",{name:"Whispers about Owner 1",exact:true})).toHaveCount(0);
 await expect(preview.getByRole("heading",{name:"Whispers about Owner 2"})).toBeVisible();
 await expect(preview).toContainText("No whispers yet. Start the conversation.");
 await expect(preview.getByLabel("Your whisper",{exact:true})).toHaveValue("");
});

test("Creative experiments provide local visuals, opt-in audio and printable bricks", async ({page},info)=>{
 await fixture(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.locator('.experiments-menu').click();
 async function open(name:string){await page.locator('.experiment-menu-controls').getByRole('button',{name,exact:true}).click();return page.getByRole('dialog',{name,exact:true});}
 let dialog=await open('Atmosphere');await dialog.getByRole('button',{name:'Rain',exact:true}).click();await expect(page.locator('.atmosphere-rain')).toBeAttached();await expect(dialog).toContainText('not a live weather report');await page.keyboard.press('Escape');
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.wall-atmosphere i').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');await page.emulateMedia({reducedMotion:'no-preference'});
 dialog=await open('Atmosphere');await dialog.getByRole('button',{name:'Clear / off',exact:true}).click();await page.keyboard.press('Escape');await expect(page.locator('.wall-atmosphere')).toHaveCount(0);
 dialog=await open('Decade Warp');for(const [label,era] of [['1984 · Monochrome','1984'],['1996 · Early web','1996'],['2077 · Neon future','2077'],['Present day','present']]){await dialog.getByRole('button',{name:label,exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-wall-era',era);}await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Thermal',exact:true}).click();const thermal=page.locator('.page-thermal');await expect(thermal).toBeVisible();const blank=await thermal.evaluate((c:HTMLCanvasElement)=>c.toDataURL());await page.mouse.move(150,300);await expect.poll(()=>thermal.evaluate((c:HTMLCanvasElement)=>c.toDataURL())).not.toBe(blank);await page.getByRole('button',{name:'Clear trail'}).click();await expect.poll(()=>thermal.evaluate((c:HTMLCanvasElement)=>c.toDataURL())).toBe(blank);await page.keyboard.press('Escape');
 await page.locator('.experiment-menu-controls').getByRole('button',{name:'Blacklight',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-wall-blacklight','on');await expect(page.getByRole('dialog',{name:'Blacklight',exact:true})).toHaveCount(0);await page.screenshot({path:`/tmp/ttw-blacklight-${info.project.name}.png`});await page.keyboard.press('Escape');await expect(page.locator('html')).toHaveAttribute('data-wall-blacklight','off');
 dialog=await open('Morse');await expect(dialog).toContainText('Radio silent.');await dialog.getByRole('button',{name:'Play Morse'}).click();await expect(dialog).toContainText('Transmitting…');await dialog.getByRole('button',{name:'Stop',exact:true}).click();await expect(dialog).toContainText('Radio silent.');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Theremin',exact:true}).click();const instrument=page.getByRole('complementary',{name:'Theremin controls'});await instrument.getByRole('button',{name:'Start instrument'}).click();await expect(instrument.getByRole('button',{name:'Mute instrument'})).toBeVisible();await page.mouse.move(170,310);await instrument.getByRole('button',{name:'Mute instrument'}).click();await expect(instrument).toContainText('Sound off');await page.keyboard.press('Escape');
 dialog=await open('Origami');
 for(const paper of ['A4','Letter']){
 await dialog.getByLabel('Paper size').selectOption(paper);await dialog.getByRole('button',{name:'Generate paper brick'}).click();
 await expect(dialog.getByAltText('Printable paper brick: six faces with fold lines and glue tabs')).toBeVisible();
 const popupPromise=page.waitForEvent('popup');await dialog.getByRole('link',{name:`Print / Save as PDF · ${paper}`,exact:true}).click();const popup=await popupPromise;await popup.waitForLoadState();
 await expect(popup.locator('svg')).toBeVisible();await expect(popup.locator('parsererror')).toHaveCount(0);
 const pdf=await popup.pdf({path:`/tmp/ttw-paper-brick-${paper}-${info.project.name}.pdf`,preferCSSPageSize:true,printBackground:true});
 expect((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length).toBe(1);
 await popup.screenshot({path:`/tmp/ttw-paper-brick-${paper}-${info.project.name}.png`,fullPage:true});await popup.close();
 }
 await page.keyboard.press('Escape');expect(errors).toEqual([]);
});

test("Blacklight follows navigation and focus without blocking the page",async({page},info)=>{
 await fixture(page);await page.goto('/');await page.locator('.experiments-menu').click();
 const toggle=page.getByRole('button',{name:'Blacklight',exact:true});await toggle.click();
 await expect(toggle).toHaveAttribute('aria-pressed','true');await expect(page.locator('dialog[open]')).toHaveCount(0);
 const shade=page.locator('.blacklight-shade');await expect(shade).toBeVisible();await expect(shade).toHaveCSS('pointer-events','none');
 await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(120,260);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--blacklight-x'))).toBe('120px');
 await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--blacklight-y'))).toBe('260px');
 await page.screenshot({path:`/tmp/ttw-blacklight-page-${info.project.name}.png`});
 const keep=page.locator('.keep-or-yeet').getByRole('button',{name:/^KEEP/});await keep.click();await expect(keep).toHaveAttribute('aria-pressed','true');
 const whisper=page.locator('.whisper-preview').getByLabel('Your whisper',{exact:true});await whisper.focus();await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--blacklight-radius'))).not.toBe('');
 await page.goto('/about');await expect(page.locator('html')).toHaveAttribute('data-wall-blacklight','on');await expect(page.getByRole('button',{name:/Exit Blacklight/})).toBeVisible();
 await page.getByRole('button',{name:/Exit Blacklight/}).click();await expect(shade).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('ttw-blacklight'))).toBe('off');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-wall-blacklight','off');
});

test("Page-wide Thermal and Theremin preserve navigation and restore muted", async({page},info)=>{
 await fixture(page);await page.goto('/');await page.locator('.experiments-menu').click();
 await page.getByRole('button',{name:'Thermal',exact:true}).click();await expect(page.locator('dialog[open]')).toHaveCount(0);
 const trail=page.locator('.page-thermal');await expect(trail).toHaveCSS('pointer-events','none');
 await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(160,320,{steps:12});
 await page.screenshot({path:`/tmp/ttw-thermal-page-${info.project.name}.png`});
 const keep=page.locator('.keep-or-yeet').getByRole('button',{name:/^KEEP/});await keep.click();await expect(keep).toHaveAttribute('aria-pressed','true');
 const contrast=await new AxeBuilder({page}).withRules(['color-contrast']).analyze();expect(contrast.violations).toEqual([]);
 await page.goto('/about');await expect(page.locator('html')).toHaveAttribute('data-wall-interaction','thermal');await page.getByRole('button',{name:/Exit Thermal/}).click();await expect(trail).toHaveCount(0);
 await page.goto('/');await page.locator('.experiments-menu').click();await page.getByRole('button',{name:'Blacklight',exact:true}).click();
 await page.getByRole('button',{name:'Theremin',exact:true}).click();await expect(page.locator('.blacklight-shade')).toHaveCount(0);await expect(page.locator('html')).toHaveAttribute('data-wall-interaction','theremin');
 await expect(page.locator('dialog[open]')).toHaveCount(0);await page.getByRole('button',{name:'Start instrument',exact:true}).click();await expect(page.getByRole('button',{name:'Mute instrument',exact:true})).toBeVisible();
 await page.mouse.move(180,400);await expect.poll(()=>page.locator('.page-theremin').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--theremin-x'))).toBe('180px');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-wall-interaction','theremin');await expect(page.getByRole('button',{name:'Start instrument',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Mute instrument',exact:true})).toHaveCount(0);
 await page.goto('/about');await page.getByRole('button',{name:/Exit Theremin/}).click();await expect(page.locator('.page-theremin')).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('ttw-interaction'))).toBe('off');
});

test("Dark page modes keep neon buttons readable on hover and keyboard focus",async({page})=>{
 await fixture(page);await page.goto('/');
 for(const mode of ['blacklight','thermal','theremin','obsidian']){
   await page.evaluate(mode=>{
     const root=document.documentElement;
     root.dataset.wallTheme=mode==='obsidian'?'obsidian':'paper';
     root.dataset.wallBlacklight=mode==='blacklight'?'on':'off';
     root.dataset.wallInteraction=mode==='thermal'||mode==='theremin'?mode:'off';
   },mode);
   const button=page.locator('.wall-viewport .button.primary');await button.hover();
   await expect(button).toHaveCSS('color','rgb(17, 17, 15)');
   const accent=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
   await expect.poll(()=>button.evaluate((el,accent)=>{const probe=document.createElement('span');probe.style.color=accent;document.body.append(probe);const color=getComputedStyle(probe).color;probe.remove();return getComputedStyle(el).backgroundColor===color;},accent)).toBe(true);
   await page.mouse.move(0,0);await button.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
   await expect(button).toBeFocused();await expect(button).toHaveCSS('color','rgb(17, 17, 15)');
   const contrast=await new AxeBuilder({page}).include('.purchase-band').withRules(['color-contrast']).analyze();expect(contrast.violations).toEqual([]);
 }
});

test("Playground stays in place and changes color when selected",async({page})=>{
 await fixture(page);await page.goto("/");
 const button=page.getByRole("button",{name:"Playground",exact:true});
 await button.scrollIntoViewIfNeeded();
 const position=()=>button.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,bg:getComputedStyle(el).backgroundColor};});
 const before=await position();await expect(page.locator("#playground-controls")).toBeHidden();
 await button.click();await expect(button).toHaveAttribute("aria-expanded","true");await expect(page.locator("#playground-controls")).toBeVisible();
 const after=await position();expect(after.x).toBeCloseTo(before.x,0);expect(after.y).toBeCloseTo(before.y,0);expect(after.bg).not.toBe(before.bg);
 await button.click();await expect(page.locator("#playground-controls")).toBeHidden();await expect(button).toHaveAttribute("aria-expanded","false");
});

test("current wall referral counter follows the owner and explains accepted visits", async ({ page }) => {
  const wall = await fixture(page);
  await page.goto("/");
  const stats = page.getByRole("region", { name: "Current reign analytics" });
  const counter = stats.locator(".metric").filter({ has: page.getByRole("button", { name: "REFERRALS", exact: true }) });
  await expect(counter.locator(":scope > strong")).toHaveText("12");
  await stats.getByRole("button", { name: "REFERRALS", exact: true }).click();
  await expect(page.getByText(/Accepted distinct browser visits/)).toBeVisible();
  await page.keyboard.press("Escape");
  wall.changeOwner();
  await expect(counter.locator(":scope > strong")).toHaveText("0");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
