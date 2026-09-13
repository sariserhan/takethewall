import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
test("admin edits the notification recipient and toggle without leaving /admin", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const token = [
    { alg: "RS256", typ: "JWT" },
    {
      sub: "admin-fixture",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    "fixture",
  ]
    .map((x) =>
      Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString(
        "base64url",
      ),
    )
    .join(".");
  await page.route("**/api/auth/**", (route) => {
    if (route.request().url().includes("token"))
      return route.fulfill({ json: { token } });
    return route.fulfill({
      json: {
        session: {
          id: "session-fixture",
          token: "session-token",
          userId: "admin-fixture",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        user: {
          id: "admin-fixture",
          email: "admin@example.com",
          emailVerified: true,
          name: "Admin",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    });
  });
  await page.route("**/api/admin/health", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  let hallEnabled = false;
  const community = { crumblingEnabled:false,gazetteEnabled:false,gazetteAuto:false,event:null as null | {enabled:boolean;title:string;description:string;start:number;end:number} };
  const issues:{id:string;date:string;headline:string;body:string;status:string;revision:number;entries:{publicId:string;name:string}[]}[]=[];
  let settings = {
      enabled: true,
      recipient: "serhan.sari@yahoo.com",
      revision: 0,
    },
    saves = 0;
  const contactState: {
    reason: string | null;
    stoppedAt: number | null;
    deletionState: string | null;
    deletedAt: number | null;
    wall: {
      active: boolean;
      confirmedAt: number;
      unsubscribedAt: number | null;
    };
    milestone: null;
  } = {
    reason: null,
    stoppedAt: null,
    deletionState: null,
    deletedAt: null,
    wall: { active: true, confirmedAt: 1789200000000, unsubscribedAt: null },
    milestone: null,
  };
  await page.routeWebSocket(/convex.*\/sync/, (socket) => {
    let tick = 0;
    const timestamp = () => {
      const b = Buffer.alloc(8);
      b.writeBigUInt64LE(BigInt(tick));
      return b.toString("base64");
    };
    let version = { querySet: 0, identity: 0, ts: timestamp() };
    const queries = new Map<number, string>();
    const value = (path: string): unknown =>
      path === "community:controls" ? community : path === "community:issues" ? issues : path === "hall:settings" ? { enabled: hallEnabled, ready: true } : path === "growth:adminHistory" ? { entries: [], next: null } : path === "growth:visibility" ? true : path === "owners:recentFeedback" ? [] : path === "contactManagement:details"
        ? JSON.stringify(contactState)
        : path === "emailDirectory:list"
          ? JSON.stringify({
              rows: [
                {
                  id: "contact-1",
                  email: "reader@example.com",
                  sources: ["wall subscriber"],
                  createdAt: 1789200000000,
                  wall: "Confirmed · daily",
                  milestone: "Not subscribed",
                  last: {
                    kind: "wall_daily",
                    state: "accepted",
                    at: 1789200000000,
                  },
                },
              ],
              cursor: "",
              done: true,
            })
          : path === "emailDirectory:history"
            ? JSON.stringify({
                rows: [
                  {
                    id: "mail-1",
                    kind: "wall_daily",
                    subject: "Your daily wall update",
                    state: "accepted",
                    createdAt: 1789200000000,
                    updatedAt: 1789200001000,
                    sentAt: 1789200001000,
                    events: [
                      {
                        eventId: "event-1",
                        type: "email.delivered",
                        occurredAt: 1789200002000,
                      },
                    ],
                  },
                ],
                cursor: "",
                done: true,
              })
            : path === "deliveryAdmin:overview"
              ? JSON.stringify({
                  emails: [
                    {
                      id: "job-fixture",
                      queue: "jobs",
                      kind: "activation_email",
                      state: "failed",
                      attempts: 12,
                      createdAt: Date.now(),
                      nextAt: Date.now(),
                      error: "Provider unavailable",
                      retryBefore: Date.now() + 23 * 3600_000,
                    },
                  ],
                  activations: [
                    {
                      id: "owner-fixture",
                      name: "Pending Studio",
                      createdAt: Date.now(),
                      sessionId: "cs_test_fixture",
                      environment: "test",
                      expired: false,
                      blocked: false,
                    },
                  ],
                  limit: 50,
                })
              : path === "funnel:report"
                ? {
                    visits: 100,
                    checkoutStarts: 20,
                    paidActivations: 10,
                    startedAt: 1789200000000,
                    daysTracked: 2,
                  }
                : path === "admin:identity"
                  ? "admin@example.com"
                  : path === "admin:overview"
                    ? ({ milestones: [] })
                    : path === "admin:getNotificationSettings"
                      ? settings
                      : path === "admin:getSettings"
                        ? {
                            milestones: [],
                            initialDays: 7,
                            additionalDays: 7,
                            rulesVersion: "test",
                            rulesJson: "{}",
                            rewardsEnabled: false,
                            payoutsEnabled: false,
                            promotionEnabled: false,
                          }
                        : null;
    function transition(
      changes: unknown[],
      patch: Partial<typeof version> = {},
    ) {
      tick++;
      const end = { ...version, ...patch, ts: timestamp() };
      socket.send(
        JSON.stringify({
          type: "Transition",
          startVersion: version,
          endVersion: end,
          modifications: changes,
        }),
      );
      version = end;
    }
    socket.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "Authenticate")
        transition([], { identity: msg.baseVersion + 1 });
      if (msg.type === "ModifyQuerySet") {
        const changes = msg.modifications.map(
          (q: { type: string; queryId: number; udfPath: string }) => {
            if (q.type === "Remove") {
              queries.delete(q.queryId);
              return { type: "QueryRemoved", queryId: q.queryId };
            }
            queries.set(q.queryId, q.udfPath);
            return {
              type: "QueryUpdated",
              queryId: q.queryId,
              value: value(q.udfPath),
              logLines: [],
              journal: null,
            };
          },
        );
        transition(changes, { querySet: msg.newVersion });
      }
      if (msg.type === "Mutation") {
        if(msg.udfPath.startsWith("community:")){
          const a=msg.args[0]; let result:unknown=null;
          if(msg.udfPath==="community:configure") Object.assign(community,{[a.feature]:a.enabled});
          if(msg.udfPath==="community:scheduleEvent") community.event=a.event;
          if(msg.udfPath==="community:createDraft"){issues.push({id:"gazette-fixture",date:a.date,headline:"Another day on the wall.",body:"A selection of public placements.",status:"draft",revision:0,entries:[{publicId:"ttw_"+"a".repeat(32),name:"Raven Studio"}]});result="gazette-fixture";}
          if(msg.udfPath==="community:review") Object.assign(issues[0],{headline:a.headline,body:a.body,status:a.publish?"published":"draft",revision:issues[0].revision+1});
          tick++;socket.send(JSON.stringify({type:"MutationResponse",requestId:msg.requestId,success:true,result,ts:timestamp(),logLines:[]}));
          transition([...queries].filter(([,path])=>path.startsWith("community:")).map(([id,path])=>({type:"QueryUpdated",queryId:id,value:value(path),logLines:[],journal:null})));return;
        }
        if (msg.udfPath === "hall:setEnabled") {
          hallEnabled = msg.args[0].enabled;
          tick++; socket.send(JSON.stringify({ type: "MutationResponse", requestId: msg.requestId, success: true, result: null, ts: timestamp(), logLines: [] }));
          transition([...queries].filter(([, path]) => path === "hall:settings").map(([id, path]) => ({ type: "QueryUpdated", queryId: id, value: value(path), logLines: [], journal: null })));
          return;
        }
        if (
          ["contactManagement:unsubscribe", "contactManagement:erase"].includes(
            msg.udfPath,
          )
        ) {
          expect(msg.args[0].email).toBe("reader@example.com");
          contactState.reason = "admin_unsubscribe";
          contactState.stoppedAt = 1789200003000;
          contactState.wall.active = false;
          contactState.wall.unsubscribedAt = 1789200003000;
          if (msg.udfPath === "contactManagement:erase") {
            expect(msg.args[0].confirmation).toBe("reader@example.com");
            contactState.deletionState = "complete";
            contactState.deletedAt = 1789200003000;
          }
          tick++;
          socket.send(
            JSON.stringify({
              type: "MutationResponse",
              requestId: msg.requestId,
              success: true,
              result: null,
              ts: timestamp(),
              logLines: [],
            }),
          );
          transition(
            [...queries]
              .filter(([, path]) => path === "contactManagement:details")
              .map(([id, path]) => ({
                type: "QueryUpdated",
                queryId: id,
                value: value(path),
                logLines: [],
                journal: null,
              })),
          );
          return;
        }
        if (msg.udfPath === "deliveryAdmin:retry") {
          tick++;
          socket.send(
            JSON.stringify({
              type: "MutationResponse",
              requestId: msg.requestId,
              success: true,
              result: null,
              ts: timestamp(),
              logLines: [],
            }),
          );
          transition([]);
          return;
        }
        expect(msg.udfPath).toBe("admin:saveNotificationSettings");
        const a = msg.args[0];
        expect(a.expectedRevision).toBe(settings.revision);
        settings = {
          enabled: a.enabled,
          recipient: a.recipient,
          revision: settings.revision + 1,
        };
        saves++;
        tick++;
        socket.send(
          JSON.stringify({
            type: "MutationResponse",
            requestId: msg.requestId,
            success: true,
            result: null,
            ts: timestamp(),
            logLines: [],
          }),
        );
        transition(
          [...queries]
            .filter(([, path]) => path === "admin:getNotificationSettings")
            .map(([id, path]) => ({
              type: "QueryUpdated",
              queryId: id,
              value: value(path),
              logLines: [],
              journal: null,
            })),
        );
      }
    });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "emails", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Email directory" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Confirmed · daily", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View emails" }).click();
  const history = page.getByRole("dialog");
  await expect(
    history.getByRole("heading", { name: "Your daily wall update" }),
  ).toBeVisible();
  await expect(history.getByText(/delivered ·/)).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
  expect(
    (await new AxeBuilder({ page }).include("dialog[open]").analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: `/tmp/admin-email-directory-${info.project.name}.png`,
    fullPage: false,
  });
  await expect(history.getByText(/Confirmed: 2026-/)).toBeVisible();
  await history
    .getByRole("button", { name: "Unsubscribe optional emails" })
    .click();
  await expect(history.getByText(/Optional emails paused/)).toBeVisible();
  await history
    .getByRole("button", { name: "Delete contact email data…", exact: true })
    .click();
  const erase = history.getByRole("button", {
    name: "Delete contact email data permanently",
  });
  await expect(erase).toBeDisabled();
  await history
    .getByLabel("Type reader@example.com to confirm")
    .fill("wrong@example.com");
  await expect(erase).toBeDisabled();
  await history
    .getByLabel("Type reader@example.com to confirm")
    .fill("reader@example.com");
  expect(
    (await new AxeBuilder({ page }).include("dialog[open]").analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: `/tmp/contact-controls-${info.project.name}.png`,
    fullPage: false,
  });
  await erase.click();
  await expect(
    history.getByText("Contact email deletion complete."),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Takeover notifications" }),
  ).toBeVisible();
  await page.getByLabel("Notification recipient").fill("new@example.com");
  await page.getByLabel("Email me when someone takes the wall").uncheck();
  await page
    .getByRole("button", { name: "Save notification settings" })
    .click();
  await expect(page.getByText("Notification settings saved.")).toBeVisible();
  expect(saves).toBe(1);
  expect(settings).toMatchObject({
    enabled: false,
    recipient: "new@example.com",
  });
  await expect(page).toHaveURL(/\/admin$/);
  await page.screenshot({
    path: `/tmp/admin-notifications-${info.project.name}.png`,
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "funnel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Measured activity funnel" }),
  ).toBeVisible();
  await expect(page.locator(".funnel-stages")).toContainText("100");
  await expect(
    page.getByText("Checkout / visit ratio:", { exact: false }),
  ).toContainText("20.0%");
  await page.getByRole("button", { name: "Last 30 days" }).click();
  await expect(
    page.getByRole("button", { name: "Last 30 days" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/admin$/);
  await page.screenshot({
    path: `/tmp/admin-funnel-${info.project.name}.png`,
    fullPage: false,
  });
  await page.route("**/api/admin/recover", (r) =>
    r.fulfill({
      json: {
        message: "Stripe has not confirmed payment. Nothing was published.",
      },
    }),
  );
  await page.getByRole("button", { name: "delivery", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Delivery & activation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry email", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("original delivery key");
  await page
    .getByRole("button", { name: "Check Stripe status" })
    .click();
  await expect(page.getByRole("status")).toContainText("Nothing was published");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `/tmp/delivery-${info.project.name}.png`,
    fullPage: true,
  });
  await expect(page).toHaveURL(/\/admin$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "growth", exact: true }).click();
  const hallToggle = page.getByLabel("Show Hall of Fame publicly");
  await expect(hallToggle).not.toBeChecked(); await hallToggle.click(); await expect(hallToggle).toBeChecked();
  expect(hallEnabled).toBe(true); await hallToggle.click(); await expect(hallToggle).not.toBeChecked();
  expect(hallEnabled).toBe(false);
  const crumbling=page.getByLabel("Show Crumbling Wall on homepage");await crumbling.click();await expect(crumbling).toBeChecked();expect(community.crumblingEnabled).toBe(true);await crumbling.click();await expect(crumbling).not.toBeChecked();
  await page.getByText("Schedule a community hour",{exact:true}).click();await page.getByLabel("Starts (UTC)").fill("2026-09-18T19:00");await page.getByLabel("Ends (UTC)").fill("2026-09-18T20:00");await page.getByLabel("Show event publicly").check();await page.getByRole("button",{name:"Save community event"}).click();await expect.poll(()=>community.event?.enabled).toBe(true);
  await page.getByLabel("Issue date (completed UTC day)").fill("2026-09-12");await page.getByRole("button",{name:"Prepare draft",exact:true}).click();await page.locator(".gazette-review summary").click();await page.getByLabel("Gazette headline").fill("Projects make their mark");await page.getByRole("button",{name:"Approve & publish Gazette"}).click();await expect(page.locator(".gazette-review summary")).toContainText("published");expect(issues[0].headline).toBe("Projects make their mark");

  expect(errors).toEqual([]);
});
