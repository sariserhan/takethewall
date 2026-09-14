import { test, expect } from "@playwright/test";

test("new arrivals chime with Radar closed, without replaying history or doubling sounds", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { starts: 0 };
    Object.assign(window, { radarAudioTest: state });
    class TestAudio {
      state = "suspended";
      currentTime = 0;
      destination = {};
      async resume() { this.state = "running"; }
      async close() { this.state = "closed"; }
      createOscillator() {
        return { frequency: { value: 0 }, connect() {}, disconnect() {}, onended: null,
          start() { state.starts++; }, stop() {} };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
      }
    }
    Object.assign(window, { AudioContext: TestAudio });
  });
  let emit: ((id: string, receivedAt?: number) => void) | undefined;
  await page.routeWebSocket(/convex.*\/sync/, socket => {
    let version = { querySet: 0, identity: 0, ts: Buffer.alloc(8).toString("base64") };
    let tick = 0;
    let radarId: number | undefined;
    const rows = [{ id: "history", receivedAt: Date.now(), city: "London", country: "GB" }];
    const transition = (modifications: unknown[], querySet = version.querySet) => {
      const ts = Buffer.alloc(8);
      ts.writeBigUInt64LE(BigInt(++tick));
      const end = { ...version, querySet, ts: ts.toString("base64") };
      socket.send(JSON.stringify({ type: "Transition", startVersion: version, endVersion: end, modifications }));
      version = end;
    };
    emit = (id, receivedAt = Date.now()) => {
      if (radarId === undefined) throw Error("Radar is not subscribed outside its dialog");
      if (!rows.some(row => row.id === id)) rows.unshift({ id, receivedAt, city: "Mexico City", country: "MX" });
      transition([{ type: "QueryUpdated", queryId: radarId, value: rows, logLines: [], journal: null }]);
    };
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw));
      if (message.type !== "ModifyQuerySet") return;
      transition(message.modifications.map((query: { type: string; queryId: number; udfPath: string }) => {
        if (query.type === "Remove") return { type: "QueryRemoved", queryId: query.queryId };
        if (query.udfPath === "visitLedger:radar") radarId = query.queryId;
        return { type: "QueryUpdated", queryId: query.queryId, logLines: [], journal: null,
          value: query.udfPath === "visitLedger:radar" ? rows : query.udfPath === "checkoutControls:state" ? { paused: false } : null };
      }), message.newVersion);
    });
  });
  const starts = () => page.evaluate(() => (window as unknown as { radarAudioTest: { starts: number } }).radarAudioTest.starts);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Radar", exact: true })).toBeVisible();
  await page.getByRole("heading", { name: "TAKE THE WALL", exact: true }).click();
  expect(await starts()).toBe(0);
  await expect.poll(() => Boolean(emit)).toBe(true);
  emit!("first");
  await expect.poll(starts).toBe(1);
  await page.getByRole("button", { name: "Radar", exact: true }).click();
  const radar = page.getByRole("dialog", { name: "Radar", exact: true });
  await expect(radar).toContainText("Arrival sound is enabled across the wall");
  expect(await starts()).toBe(1);
  emit!("second");
  await expect.poll(starts).toBe(2);
  await page.keyboard.press("Escape");
  emit!("third");
  await expect.poll(starts).toBe(3);
  emit!("third");
  emit!("stale", Date.now() - 60_000);
  // The next fresh update proves the intervening duplicate/stale updates added no chimes.
  emit!("fourth");
  await expect.poll(starts).toBe(4);
});
