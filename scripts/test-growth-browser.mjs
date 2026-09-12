// Isolated SSR fixtures for growth UI checks. No records or emails are created.
// Run after `npm run build`: node scripts/test-growth-browser.mjs
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
const id = "ttw_" + "a".repeat(32);
const owner = {
  id: "browser-fixture",
  contentType: "personal",
  linkType: "other",
  displayName: "Raven Studio",
  takeoverNumber: 16,
  outboundLinkEnabled: false,
  websiteUrl: "",
  domain: "",
  description:
    "Independent tools for curious people. A small studio making thoughtful things for the web.",
  logoUrl: null,
  activatedAt: 1789200000000,
  activationSequence: 16,
  impressions: 120,
  uniqueVisitors: 42,
  clicks: 12,
  kind: "paid",
};
const history = {
  entries: [
    {
      publicId: id,
      name: owner.displayName,
      description: owner.description,
      image: null,
      activatedAt: owner.activatedAt,
      replacedAt: null,
      sequence: 16,
      live: true,
    },
    {
      publicId: "ttw_" + "b".repeat(32),
      name: "Paper Planes",
      description: "A playful place to launch your next idea.",
      image: null,
      activatedAt: 1789190000000,
      replacedAt: 1789200000000,
      sequence: 15,
      live: false,
    },
  ],
  next: null,
};
const fixtures = {
  growthHistory: history,
  growthVisibility: true,
  ownerShared: {
    owner,
    publicId: id,
    active: true,
    replacedAt: null,
    searchIndexable: true,
    editorial:
      "Raven Studio creates independent tools for the web. This public takeover introduces its work and preserves the studio’s place in wall history.",
  },
  growthSitemapCount: 1,
  growthSitemap: [{ publicId: id, modified: 1789200000000 }],
};
const proxy = createServer(async (req, res) => {
  try {
    let raw = "";
    for await (const c of req) raw += c;
    const { op } = JSON.parse(raw);
    if (!(op in fixtures)) {
      res.writeHead(503);
      res.end("Not part of the browser fixture");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(fixtures[op]));
  } catch {
    res.writeHead(400);
    res.end();
  }
});
(async () => {
  let server;
  try {
    await new Promise((r) => proxy.listen(3043, "127.0.0.1", r));
    server = spawn(
      "node",
      ["node_modules/next/dist/bin/next", "start", "--port", "3042"],
      {
        stdio: "ignore",
        env: {
          ...process.env,
          CONVEX_HTTP_URL: "http://127.0.0.1:3043",
          WALL_SERVER_SECRET: "browser-fixture-only-not-a-real-secret-12345",
        },
      },
    );
    await new Promise((r) => setTimeout(r, 1600));
    const browserEnv = {
      ...process.env,
      TEST_BASE_URL: "http://localhost:3042",
      TTW_GROWTH_FIXTURES: "1",
    };

    if (fs.existsSync("/tmp/company-operator-browser-libs/fonts.conf")) {
      browserEnv.FONTCONFIG_FILE =
        "/tmp/company-operator-browser-libs/fonts.conf";
      browserEnv.LD_LIBRARY_PATH =
        "/tmp/company-operator-browser-libs/extracted/usr/lib/x86_64-linux-gnu";
    }
    const run = spawn(
      "npx",
      [
        "playwright",
        "test",
        "e2e/growth.spec.ts",
        "e2e/embedded-checkout.spec.ts",
      ],
      { stdio: "inherit", env: browserEnv },
    );
    process.exitCode = await new Promise((r) => run.on("exit", r));
    if (process.exitCode === 0) {
      fixtures.growthHistory = null;
      fixtures.growthVisibility = false;
      const hidden = spawn(
        "npx",
        ["playwright", "test", "e2e/history-hidden.spec.ts"],
        {
          stdio: "inherit",
          env: { ...browserEnv, TTW_HISTORY_HIDDEN_FIXTURE: "1" },
        },
      );
      process.exitCode = await new Promise((r) => hidden.on("exit", r));
    }
  } finally {
    server?.kill();
    proxy.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
