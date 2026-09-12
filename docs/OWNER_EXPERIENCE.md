# Owner experience and weekly digest

Owners can request a private dashboard link at `/owner` using their public takeover number and the email used at checkout. Activation and replacement emails also include this link. Access does not require an account. The private link must not be shared; the dashboard provides a separate public share link and downloadable 1200×630 PNG.

Checkout now includes desktop/mobile content review before creating an embedded Stripe checkout. Reports from the live wall enter the existing admin support queue with a snapshot of the reported placement and moderation actions.

## Weekly email

The current subscribed owner receives a branded digest every Monday at 09:00 UTC. The report contains measured totals since the takeover activated: impressions, unique visitors, clicks, CTR, and reign duration. Demo additions are excluded. It is a weekly delivery of lifetime takeover totals, not a seven-day comparison.

Delivery uses the existing retryable jobs outbox, a stable snapshot, and one job per owner per week. Eligibility is checked again before dispatch; replaced, blocked, unsubscribed, and nonproduction purchases do not receive the digest. Owners can opt out at checkout, in their dashboard, or through the email unsubscribe link. Email-provider one-click unsubscribe is also supported.

## Configuration and rollout

Existing Convex environment variables are reused: `CLAIM_TOKEN_SECRET` (at least 32 characters), `SITE_URL`, `RESEND_API_KEY`, `RESEND_FROM`, and `WALL_ENVIRONMENT=production`. Set optional `WEEKLY_OWNER_DIGEST_ENABLED=false` on Convex to pause weekly delivery. No new required secret or webhook is needed.

Deploy the frontend and Convex backend together. Deployment registers the Monday schedule; no immediate digest is sent. Existing owners can request access from `/owner`. Rotating `CLAIM_TOKEN_SECRET` invalidates old owner links; requesting a new link regenerates access.

Private owner pages are not indexed or tracked by VisitorPing. Access tokens arrive in URL fragments, are removed by the client, and establish an HttpOnly cookie. Public share endpoints only expose eligible published content and return 404 for removed content.

## Validation

Backend tests cover token scope, key rotation, email recovery, digest deduplication and suppression, unsubscribe, and reports. Desktop/mobile browser tests cover preview-before-payment, embedded checkout, reports, private dashboard, and unsubscribe. Email rendering was checked at desktop and mobile widths; the real image endpoint was checked for PNG dimensions and removed-content 404 behavior. Email provider calls were mocked; no test emails were sent.

## Editing a live takeover

The private owner dashboard now includes **Edit your content** while that takeover is current. Owners can change the display name, description, destination/content type, and image; they preview before saving and pay nothing extra. Each save checks the current takeover and expected content revision atomically. Replaced, blocked, stale-tab, and unauthenticated edits are rejected. Edits cannot re-enable a link disabled by moderation.

Edits leave the takeover number, activation timestamp, counters, payment, and prize progression untouched. The first edit preserves original content for activation-hash verification and permanent milestone snapshots; original winning images remain stored. Before/after changes appear as `OWNER_CONTENT_EDITED` in the admin audit tab. Public share pages reflect the edited content.

## Administrator takeover notifications

Every new production paid takeover or admin publication queues a branded email to `serhan.sari@yahoo.com`, using the existing `RESEND_FROM` sender (`notification@takethewall.com`). It includes owner and buyer/receipt email, public takeover number, destination, description, image availability, UTC activation time, source, amount/currency, available Stripe references, record ID, activation hash, published-content link, and an admin dashboard button. It never includes owner login tokens or card details.

The snapshot is captured in the activation transaction, with one job per takeover. Retries reuse the same idempotency key; edits and repeated payment webhooks do not produce additional takeover notifications. Delivery uses the existing outbox dispatcher. Development/test activations are suppressed. There is no backfill for past takeovers and no new required environment variable or webhook. Temporary notification snapshots are removed after successful delivery and follow contact deletion when undelivered.

Validation for this update: 130 unit/backend tests and 12 desktop/mobile browser flows passed; lint, typecheck, production build, and development Convex sync passed. Mail was rendered at 390px and 900px with the logo loaded and no horizontal overflow. Provider calls were mocked; no live test email was sent.
