# Email deliverability investigation

Checked 2026-09-12 using live DNS and the Resend domains/email APIs. No DNS or provider settings were changed.

## Verified

- Resend lists `takethewall.com` as verified, with sending enabled and verified DKIM and SPF records.
- `send.takethewall.com` authorizes Amazon SES through SPF.
- DMARC exists with `p=none`, with aggregate reporting to Cloudflare and Brevo. A monitoring policy is not an authentication failure.
- Resend open tracking and click tracking are both disabled already.
- The latest inspected message (18:11 UTC) has provider status `delivered`, 2,899 bytes of HTML, a 299-byte plain-text alternative, and only `www.takethewall.com` HTTP links. Delivery is not proof of inbox placement.
- That message still uses `contact@takethewall.com` with no reply-to. The purpose-based sender routing in commit `605512e` supplies branded sender names and reply-to addresses for new messages after the updated sending code is deployed. Previously attempted messages intentionally keep their original payload for retry idempotency.

## What remains unknown

Resend's outbound email API does not provide Yahoo's receiving-side Authentication-Results header or folder placement. Obtain the `spf=`, `dkim=`, and `dmarc=` results from an affected message before changing authentication records. Do not collect the email body, OTP, or owner-access links for this check.

If authentication passes, investigate reputation and recipient filtering using actual delivery evidence. The domain was added to Resend on September 11; this establishes recent provider setup, not the domain's registration age or a proven spam cause. Changing sender local parts or tightening DMARC does not guarantee inbox placement.

Keep existing SPF/DMARC records intact until evidence identifies a specific issue. In particular, SPF at the root and the `send` subdomain apply to different sending hosts.

References: [Resend tracking](https://resend.com/docs/dashboard/domains/tracking), [DMARC](https://resend.com/docs/dashboard/domains/dmarc), [deliverability insights](https://resend.com/docs/dashboard/emails/deliverability-insights).
