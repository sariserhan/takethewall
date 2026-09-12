import { emailTemplate } from "./email-template";
import { ctr, duration } from "./validation";
export interface DigestSnapshot {
  displayName: string;
  number: number | null;
  impressions: number;
  uniqueVisitors: number;
  clicks: number;
  activatedAt: number;
  snapshotAt: number;
}
export function weeklyOwnerEmail(
  d: DigestSnapshot,
  dashboardUrl: string,
  unsubscribeUrl: string,
) {
  const number =
    d.number === null ? "" : " #" + d.number.toLocaleString("en-US");
  return emailTemplate(
    `Your weekly wall report${number}.`,
    `${d.displayName}, your takeover is still on the wall at the time of this update. Here are your measured totals since this takeover went live.`,
    {
      eyebrow: "YOUR WEEKLY OWNER REPORT",
      metrics: [
        { label: "Impressions", value: d.impressions.toLocaleString("en-US") },
        {
          label: "Visitors this reign",
          value: d.uniqueVisitors.toLocaleString("en-US"),
        },
        { label: "Link clicks", value: d.clicks.toLocaleString("en-US") },
        {
          label: "Click-through rate",
          value: ctr(d.impressions, d.clicks).toFixed(2) + "%",
        },
      ],
      cta: { label: "Open your private dashboard", url: dashboardUrl },
      footnote: `Totals since ${new Date(d.activatedAt).toISOString().replace("T", " ").slice(0, 19)} UTC, measured as of ${new Date(d.snapshotAt).toISOString().replace("T", " ").slice(0, 19)} UTC. Reign duration: ${duration(d.snapshotAt - d.activatedAt)}. These are measured totals, not demo additions. Ownership may change after this email.`,
      unsubscribeUrl,
    },
  );
}
