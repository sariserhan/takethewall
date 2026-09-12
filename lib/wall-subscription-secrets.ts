import { claimSecret } from "./claim-secrets";
export const wallConfirmation = (seed: string) =>
  claimSecret("wall-confirm:" + seed);
export const wallUnsubscribe = (seed: string) =>
  claimSecret("wall-unsubscribe:" + seed);
