# Shared email design

All app-controlled sends use `lib/email-template.ts`: administrator OTP (`convex/auth.ts`), takeover activation/replacement (`convex/jobs.ts`), and claim, OTP, chat, payout and support messages (`lib/transactional-email.ts`). Each message includes HTML plus the original plain-text alternative.

The shared design uses a 600px maximum-width presentation table, lime logo header, consistent content-area minimum height and footer, inline email styles and mobile padding. Longer content expands rather than being clipped. Exact rendering and height vary by email client and message length.

The PNG logo is embedded as a CID attachment, following [Resend's inline-image format](https://resend.com/docs/dashboard/emails/embed-inline-images). `lib/email-logo.ts` contains the base64 PNG from `public/brand/takethewall-icon-192.png`, so images do not depend on a public asset deployment or recipient image fetch. Brand text remains visible when a mail client hides images.

User-controlled subject/body content is HTML-escaped. HTTP(S) links remain clickable, including protected claim links. Preview fixtures contain no real OTPs or claim credentials.

Sender comes from RESEND_FROM; development is configured as notification@takethewall.com. A preview was accepted by Resend for serhan.sari@yahoo.com. Acceptance is not proof of inbox delivery. Production has not been deployed by this change.

Validation: 105 unit/backend tests, lint, typecheck and build; code/claim/long support layouts checked at widths 320, 390 and 800. Actual Gmail/Outlook/Yahoo client rendering should also be checked using the preview email.

Stripe-issued payment receipts are controlled by Stripe's branding settings and do not pass through this application template.
