import { readFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
const source = readFileSync(".env.local", "utf8");
const values = Object.fromEntries(
  source
    .split("\n")
    .filter((x) => x && !x.startsWith("#"))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
if (!values.NEXT_PUBLIC_CONVEX_URL?.startsWith("http://127.0.0.1:"))
  throw new Error("Local setup only: refusing a non-local deployment.");
const config = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3001",
  WALL_SERVER_SECRET:
    values.WALL_SERVER_SECRET ?? randomBytes(32).toString("hex"),
  WALL_TOKEN_SECRET:
    values.WALL_TOKEN_SECRET ?? randomBytes(32).toString("hex"),
  BETTER_AUTH_SECRET: values.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex"),
  CLAIM_TOKEN_SECRET: values.CLAIM_TOKEN_SECRET ?? randomBytes(32).toString("hex"),
  SITE_URL: "http://localhost:3001",
  WALL_ENVIRONMENT: "test",
  PUBLIC_METRICS_ENABLED: "false",
};
for (const [key, value] of Object.entries(config)) {
  if (!values[key]) appendFileSync(".env.local", `\n${key}=${value}\n`);
  if (
    [
      "WALL_SERVER_SECRET",
      "BETTER_AUTH_SECRET",
      "CLAIM_TOKEN_SECRET",
      "SITE_URL",
      "WALL_ENVIRONMENT",
      "PUBLIC_METRICS_ENABLED",
    ].includes(key)
  ) {
    const r = spawnSync("npx", ["convex", "env", "set", key, value], {
      encoding: "utf8",
    });
    if (r.status !== 0) throw new Error("Failed local configuration: " + key);
  }
}
const logoBase64 = readFileSync("public/visitorping.png").toString("base64");
const seeded = spawnSync(
  "npx",
  ["convex", "run", "operations:bootstrap", JSON.stringify({ logoBase64 })],
  { encoding: "utf8" },
);
if (seeded.status !== 0) throw new Error(seeded.stderr);
console.log(
  "Local server secrets configured; initial house ad seeded. No external service credentials created.",
);
