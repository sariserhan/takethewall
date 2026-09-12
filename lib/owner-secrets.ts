import { claimSecret } from "./claim-secrets";
export const ownerToken = (seed: string) =>
  claimSecret("owner-dashboard:" + seed);
export const ownerUnsubscribeToken = (seed: string) =>
  claimSecret("owner-unsubscribe:" + seed);
export const ownerBaseUrl = () =>
  (process.env.SITE_URL ?? "https://takethewall.com").replace(/\/$/, "");
