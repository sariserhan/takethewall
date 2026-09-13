import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import { validateUrl } from "./validation";
export type PulseResult = {
  status: number | null;
  elapsedMs: number;
  checkedAt: number;
  tlsVerified: boolean;
  outcome: "responded" | "unconfirmed";
};
export async function sitePulse(value: string): Promise<PulseResult> {
  const started = performance.now();
  const unknown = (): PulseResult => ({
    status: null,
    elapsedMs: Math.round(performance.now() - started),
    checkedAt: Date.now(),
    tlsVerified: false,
    outcome: "unconfirmed",
  });
  try {
    const url = new URL(validateUrl(value).websiteUrl);
    // Pin the connection to a resolved public IP. Do not resolve again at
    // connect time or follow redirects into a private network.
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true }),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error("DNS timeout")), 3000);
        timer.unref();
      }),
    ]);
    if (
      !addresses.length ||
      addresses.some((a) => ipaddr.parse(a.address).range() !== "unicast")
    )
      return unknown();
    const address = addresses[0];
    return await new Promise<PulseResult>((resolve) => {
      const req = request(
        url,
        {
          method: "HEAD",
          agent: false,
          family: address.family,
          rejectUnauthorized: true,
          headers: {
            "User-Agent": "TakeTheWall-Pulse/1.0 (+https://takethewall.com)",
            Accept: "*/*",
          },
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
        },
        (res) => {
          resolve({
            status: res.statusCode ?? null,
            elapsedMs: Math.round(performance.now() - started),
            checkedAt: Date.now(),
            tlsVerified: true,
            outcome: "responded",
          });
          res.destroy();
          req.destroy();
        },
      );
      const timer = setTimeout(
        () => req.destroy(new Error("Check timeout")),
        5000,
      );
      req.on("close", () => clearTimeout(timer));
      req.on("error", () => resolve(unknown()));
      req.end();
    });
  } catch {
    return unknown();
  }
}
