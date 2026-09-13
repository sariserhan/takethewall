import { test, expect } from "@playwright/test";
test("buyer must acknowledge a changed owner before opening payment", async ({
  page,
}) => {
  let changeOwner = () => {};
  await page.routeWebSocket(/convex.*\/sync/, (socket) => {
    const ids = new Set<number>();
    const server = socket.connectToServer();
    let latest: Record<string, unknown> | undefined;
    socket.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      for (const q of m.modifications ?? [])
        if (q.type === "Add" && q.udfPath === "checkoutControls:state")
          ids.add(q.queryId);
      server.send(raw);
    });
    server.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      for (const q of m.modifications ?? [])
        if (q.type === "QueryUpdated" && ids.has(q.queryId))
          q.value = {
            paused: false,
            ownerId: "owner-one",
            ownerName: "First project",
          };
      if (m.endVersion) latest = m.endVersion;
      socket.send(JSON.stringify(m));
    });
    changeOwner = () => {
      if (!latest) throw new Error("No initial owner");
      socket.send(
        JSON.stringify({
          type: "Transition",
          startVersion: latest,
          endVersion: latest,
          modifications: [...ids].map((queryId) => ({
            type: "QueryUpdated",
            queryId,
            value: {
              paused: false,
              ownerId: "owner-two",
              ownerName: "Second project",
            },
            logLines: [],
            journal: null,
          })),
        }),
      );
    };
  });
  let calls = 0;
  await page.route("**/api/checkout", (route) => {
    calls++;
    expect(route.request().postDataJSON().expectedCurrentId).toBe("owner-two");
    return route.fulfill({
      status: 503,
      json: { error: "Simulated checkout" },
    });
  });
  await page.goto("/?take=1");
  const sheet = page.getByRole("dialog", { name: "MAKE IT YOURS." });
  await sheet.getByRole("button", { name: "Me / Message" }).click();
  await sheet.getByLabel("Display name").fill("Owner change preview");
  await sheet.getByRole("button", { name: "PREVIEW YOUR TAKEOVER" }).click();
  await expect(sheet.getByText("First project", { exact: true })).toBeVisible();
  await sheet.getByLabel("Buyer email").fill("test@example.com");
  changeOwner();
  const pay = sheet.getByRole("button", { name: "PAY $3.99 & TAKE THE WALL" });
  await expect(pay).toBeDisabled();
  await expect(
    sheet.getByText("Second project", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(0);
  await sheet
    .getByRole("button", { name: "I reviewed the current owner" })
    .click();
  await expect(pay).toBeEnabled();
  await pay.click();
  await expect(sheet.getByRole("alert")).toContainText("Simulated checkout");
  expect(calls).toBe(1);
});

test("paused checkout keeps the wall visible and disables new payment", async ({
  page,
}) => {
  await page.routeWebSocket(/convex.*\/sync/, (socket) => {
    const ids = new Set<number>();
    const server = socket.connectToServer();
    socket.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      for (const q of msg.modifications ?? [])
        if (q.type === "Add" && q.udfPath === "checkoutControls:state")
          ids.add(q.queryId);
      server.send(raw);
    });
    server.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      for (const q of msg.modifications ?? [])
        if (q.type === "QueryUpdated" && ids.has(q.queryId))
          q.value = {
            paused: true,
            ownerId: "owner-one",
            ownerName: "Current project",
          };
      socket.send(JSON.stringify(msg));
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "NEW CHECKOUTS PAUSED" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "TAKE THE WALL", exact: true }),
  ).toBeVisible();
  await page.goto("/?take=1");
  const sheet = page.getByRole("dialog", { name: "MAKE IT YOURS." });
  await expect(sheet.getByRole("status")).toContainText(
    "New checkouts are temporarily paused",
  );
});
