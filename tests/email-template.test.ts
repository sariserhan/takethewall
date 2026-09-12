import { expect, it } from "vitest";
import { emailTemplate } from "../lib/email-template";
it("escapes untrusted email content and preserves protected links", () => {
  const body = '<img src=x onerror="alert(1)">\nhttps://example.com/reward/claim/abc?a=1&b=2\njavascript:alert(1)';
  const result = emailTemplate('<script>alert(1)</script>', body);
  expect(result.text).toBe(body);
  expect(result.html).not.toContain('<script>');
  expect(result.html).not.toContain('<img src=x');
  expect(result.html).toContain('&lt;img');
  expect(result.html).toContain('href="https://example.com/reward/claim/abc?a=1&amp;b=2"');
  expect(result.html).not.toContain('href="javascript:');
  expect(result.attachments[0].content_id).toBe("takethewall-logo");
  expect(result.html).toContain('src="cid:takethewall-logo"');
});
it("retains long messages and uses a fluid shared layout", () => {
  const body = 'A'.repeat(10000) + '\nEND OF MESSAGE';
  const result = emailTemplate("Support reply", body);
  expect(result.html).toContain('max-width:600px');
  expect(result.html).toContain('END OF MESSAGE');
  expect(result.html).not.toContain('overflow:hidden');
  expect(result.text).toBe(body);
});
