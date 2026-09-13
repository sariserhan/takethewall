import { expect, it } from "vitest";
import { finalOwnerEmail } from "../lib/owner-email";
const report = {
  displayName: "Example",
  number: 16,
  impressions: 42,
  uniqueVisitors: 20,
  clicks: 2,
  activatedAt: 1000,
  snapshotAt: 9000,
  replacedAt: 8000,
  endReason: "purchase",
};
const url = "https://takethewall.com/owner#token=private";
it("puts the protected retake CTA before stats and preserves the login token", () => {
  const email = finalOwnerEmail(report, url);
  expect(email.html).toContain("#token=private&amp;retake=1");
  expect(email.html.indexOf("TAKE IT BACK")).toBeLessThan(
    email.html.indexOf("Reign duration"),
  );
  expect(email.text).toContain("confirm a new payment");
});
it("does not invite a removed placement to republish", () => {
  const email = finalOwnerEmail({ ...report, endReason: "moderation" }, url);
  expect(email.html).not.toContain("retake=1");
  expect(email.html).not.toContain("TAKE IT BACK");
  expect(email.html).toContain("View your takeover report");
});
