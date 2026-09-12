# Owner experience and weekly digest

Owners can request a private dashboard link at `/owner` using their public takeover number and the email used at checkout. Activation and replacement emails also include this link. Access does not require an account. The private link must not be shared; the dashboard provides a separate public share link and downloadable landscape, square, and portrait PNGs.

Checkout now includes desktop/mobile content review before creating an embedded Stripe checkout. Reports from the live wall enter the existing admin support queue with a snapshot of the reported placement and moderation actions.

## Weekly email

The current subscribed owner receives a branded digest every Monday at 09:00 UTC. The report contains measured totals since the takeover activated: impressions, unique visitors, clicks, CTR, and reign duration. Demo additions are excluded. It is a weekly delivery of lifetime takeover totals, not a seven-day comparison.

Delivery uses the existing retryable jobs outbox, a stable snapshot, and one job per owner per week. Eligibility is checked again before dispatch; replaced, blocked, unsubscribed, and nonproduction purchases do not receive the digest. Owners can opt out at checkout, in their dashboard, or through the email unsubscribe link. Email-provider one-click unsubscribe is also supported.

## Configuration and rollout

Existing Convex environment variables are reused: `CLAIM_TOKEN_SECRET` (at least 32 characters), `SITE_URL`, `RESEND_API_KEY`, and `WALL_ENVIRONMENT=production`. Set optional `WEEKLY_OWNER_DIGEST_ENABLED=false` on Convex to pause weekly delivery. No new required secret or webhook is needed.

Deploy the frontend and Convex backend together. Deployment registers the Monday schedule; no immediate digest is sent. Existing owners can request access from `/owner`. Rotating `CLAIM_TOKEN_SECRET` invalidates old owner links; requesting a new link regenerates access.

Private owner pages are not indexed or tracked by VisitorPing. Access tokens arrive in URL fragments, are removed by the client, and establish an HttpOnly cookie. Public share endpoints only expose eligible published content and return 404 for removed content.

## Validation

Backend tests cover token scope, key rotation, email recovery, digest deduplication and suppression, unsubscribe, and reports. Desktop/mobile browser tests cover preview-before-payment, embedded checkout, reports, private dashboard, and unsubscribe. Email rendering was checked at desktop and mobile widths; the real image endpoint was checked for PNG dimensions and removed-content 404 behavior. Email provider calls were mocked; no test emails were sent.

## Editing a live takeover

The private owner dashboard now includes **Edit your content** while that takeover is current. Owners can change the display name, description, destination/content type, and image; they preview before saving and pay nothing extra. Each save checks the current takeover and expected content revision atomically. Replaced, blocked, stale-tab, and unauthenticated edits are rejected. Edits cannot re-enable a link disabled by moderation.

Edits leave the takeover number, activation timestamp, counters, payment, and prize progression untouched. The first edit preserves original content for activation-hash verification and permanent milestone snapshots; original winning images remain stored. Before/after changes appear as `OWNER_CONTENT_EDITED` in the admin audit tab. Public share pages reflect the edited content.

## Administrator takeover notifications

Every new production paid takeover or admin publication queues a branded email to `serhan.sari@yahoo.com`, from `notifications@takethewall.com`. It includes owner and buyer/receipt email, public takeover number, destination, description, image availability, UTC activation time, source, amount/currency, available Stripe references, record ID, activation hash, published-content link, and an admin dashboard button. It never includes owner login tokens or card details.

The snapshot is captured in the activation transaction, with one job per takeover. Retries reuse the same idempotency key; edits and repeated payment webhooks do not produce additional takeover notifications. Delivery uses the existing outbox dispatcher. Development/test activations are suppressed. There is no backfill for past takeovers and no new required environment variable or webhook. Temporary notification snapshots are removed after successful delivery and follow contact deletion when undelivered.

Validation for this update: 130 unit/backend tests and 12 desktop/mobile browser flows passed; lint, typecheck, production build, and development Convex sync passed. Mail was rendered at 390px and 900px with the logo loaded and no horizontal overflow. Provider calls were mocked; no live test email was sent.

## Final report, crop controls, and notification preferences

Replacement email is now the final takeover report: measured impressions, unique visitors, clicks, CTR, and duration, with UTC start/end times and the private dashboard button. It is a service email independent of weekly-digest preferences. The outbox waits until the two-minute late-event window closes, then freezes the metrics on first claim so provider retries retain the same payload. Expect delivery roughly two to three minutes after replacement, subject to provider availability. Paid replacement, admin publication, and moderation use the same report with the correct explanation.

New uploads in checkout and owner editing offer Original, Square, Landscape (16:9), and Portrait (4:5), plus zoom, drag, and horizontal/vertical sliders. Apply image uploads the original file and validated crop settings. The server corrects EXIF orientation, computes the bounded pixel crop, and stores the same optimized image shown everywhere. Cancel leaves the current image unchanged. Preview/payment/save waits until the selected image is applied or cancelled. Existing published images can be adjusted by choosing the source file again in Edit your content.

In `/admin` → Settings → Takeover notifications, admins can change the recipient and toggle alerts. Defaults remain enabled and `serhan.sari@yahoo.com`. Recipients are captured per new activation; changing the recipient affects future jobs. Disabling also suppresses queued alerts before dispatch, but cannot recall an email already sent or in flight. Saving settings checks the administrator allowlist, validates the email, detects stale revisions, and records an audit entry. Owner activation, final-report, and weekly emails are unaffected.

## Production verification after rollout

1. Deploy the committed frontend and Convex backend together. Confirm the existing production health panel reports Stripe live mode and Resend configuration present.
2. In admin Settings, confirm takeover notifications are enabled and the recipient is the intended inbox.
3. Publish one real takeover through embedded checkout using an inbox you control, reviewing the image crop first. The person testing must complete the actual $3.99 payment.
4. Verify exactly one activation and takeover-number increment, the owner's activation email/private dashboard link, and the administrator notification with the matching Stripe reference. Duplicate webhook delivery must not create another takeover or email.
5. During a later genuine replacement, verify the original owner's final report after the late-event window, and compare it with their private dashboard. Do not create another paid takeover solely to test the report without approving that purchase.

Automated checks use simulated payment/email responses; successful builds and mocked delivery do not prove real inbox delivery. No live charge or test email has been made for this update.

## Repeat checkout, milestone alerts, share formats, and funnel

A replaced owner can select **Take the wall again — $3.99** in their private dashboard. This creates a draft from their own content and a fresh upload ticket for the existing image. The owner reviews it through normal checkout before paying. Preparing the draft does not charge, activate a takeover, or change the original record. Blocked content and disabled outbound links cannot bypass moderation through this flow.

The homepage offers optional milestone email alerts. Signup requires consent and email confirmation within 24 hours. In production, with rewards and promotion enabled, the scheduler queues an alert when the next configured milestone is within 10 counted takeovers. Each subscriber receives at most one alert per milestone; delivery checks that the milestone has not already passed. Up to 50 subscribers are queued each minute, so this is a best-effort notification, never a reservation or prize guarantee. Email links require a deliberate confirmation or unsubscribe action. Unsubscribing suppresses queued alerts and does not change owner service emails or weekly-digest preferences. Expired inactive subscription records are cleaned up after 30 days.

Share cards now offer landscape (1200×630), square (1080×1080), and portrait (1080×1350) downloads. Each includes a QR code pointing only to the public takeover page, without private dashboard tokens or purchaser details. Removed content remains unavailable.

The **funnel** tab stays within `/admin`. Its 7- and 30-day UTC windows show measured wall page visits, Stripe checkout sessions created, and paid activations. Visits are deduplicated by page ID across owner changes; checkout attachment and payment webhook retries do not double count. Tracking requires production and `PUBLIC_METRICS_ENABLED=true`. Demo additions, numbering offsets, test purchases, and admin publications are excluded. Tracking starts with deployment; older activity is not fabricated or backfilled. Ratios compare activity within the selected period, not matched cohorts: a payment may belong to an earlier checkout, and blocked analytics may omit visits.

These features reuse existing environment variables and email delivery; no new secret or webhook is required. Deploy the frontend and Convex backend together to register the alert schedule and new tables/functions. Automated email and payment checks are mocked; they do not send real emails or charge cards.

## Recovery and delivery controls

`/admin` → **delivery** lists failed, pending, and sending email jobs plus recent pending activations. Lists are bounded at 50 records per queue/state (the general jobs queue also contains analytics jobs); this is an operational view, not a complete history. Email status means the app's outbox status, not proof of inbox delivery. Failed email retries preserve the original provider idempotency key and are permitted only within 23 hours of creation. Older failures require reconciliation in Resend before any manual send. Every retry checks the administrator allowlist and writes an audit entry.

**Check payment & publish if paid** retrieves the existing Checkout Session from Stripe. It validates owner reference, environment, complete/paid status, $3.99 amount, USD currency, and payment intent, then uses the existing atomic activation path. It never creates another charge. Concurrent webhook/recovery calls do not publish twice. A recovered payment activates now and can replace the current owner; it does not receive a backdated takeover number.

Owners can recover from `/owner` using their checkout or recorded receipt email with the takeover number left blank. The server checks up to three recent matching purchases, reconciles attached pending Checkout Sessions, and emails private dashboard links for completed eligible purchases. The response does not list matching records or return private tokens. Requests are rate-limited; repeated recovery emails are deduplicated per purchase/address/hour. A receipt email changed during an unconfirmed Stripe checkout is not known locally until Stripe confirms it: use the original checkout email in that case. Missing session attachments, removed content, deleted contact data, or payment issues require support. Legacy email lookup hashes are filled in batches of 50 by a one-minute maintenance job; new checkout and receipt writes populate them immediately. Contact deletion clears lookup hashes as well.

The owner dashboard's **Email preferences** combines weekly summaries and milestone signup/status/opt-out. Weekly preferences remain scoped to that takeover; milestone preferences apply to its checkout email across takeovers and still require separate email confirmation. Service emails about activation and final results are unaffected.

Dialogs wrap Tab/Shift+Tab and restore focus to their trigger. Close buttons and admin navigation have larger touch targets; select controls receive visible focus and reduced-motion preferences suppress animations. Playwright checked desktop and mobile recovery, preference changes, payment-check feedback, retries, modal focus, and overflow. Axe checks found no WCAG 2 A/AA or 2.1 AA violations on the tested recovery page, milestone dialog, and admin delivery view; this is not a full accessibility certification.

## Live verification findings — September 12, 2026

- The public production site responds with HTTP 200. Resend's API reports `takethewall.com` as verified.
- The available local Stripe credential is test-mode. No live charge or real notification delivery was performed for this change. After deployment, one genuine $3.99 checkout still needs to verify publication and both owner/admin inbox delivery.
- VisitorPing's live API reports site activity and custom wall events. For the inspected retained window, it returned 38 `wall_impression` events with `traffic=all`, versus zero with `exclude_bots`. At that time the app relayed these events from Convex, causing the provider to classify the relay server rather than the original browser. This relay has since been removed: custom events now use the browser tracker session. The custom-event reader now uses `traffic=all`, retaining exact event, takeover ID, and time filters. No provider numbers are added to the live Convex counters.
- Filtering those events by the current `takeoverId` still returns zero. Read-only inspection of the separate VisitorPing repository found that `apps/consumer/src/event-data.ts` drops metadata for unsupported custom events, including the wall events. Its consumer must preserve a bounded, validated takeover ID for these events before owner-scoped reporting can work. Previously discarded metadata cannot be reconstructed from the aggregate API. This separate provider repository was not changed or deployed.

Validation: 149 automated tests, 24 desktop/mobile browser flows, lint, typecheck, and production build passed. Browser plugin was unavailable; regular Playwright was used. Backend changes were synced only to the personal development deployment. Production rollout and live payment/inbox verification remain outstanding.


## Purpose-specific email senders

All application email sending now uses the shared mapping in `lib/email-routing.ts`:

| From address | Purpose | Reply-To |
| --- | --- | --- |
| account@takethewall.com | Admin sign-in codes, reward portal sign-in codes, owner dashboard/recovery links | support@takethewall.com |
| notifications@takethewall.com | Activation, replacement/final report, administrator takeover notification | support@takethewall.com |
| digest@takethewall.com | Weekly owner summaries | support@takethewall.com |
| alerts@takethewall.com | Milestone signup confirmation and approaching-milestone alerts | support@takethewall.com |
| rewards@takethewall.com | Claim invitations, claim status/reminders, winner messages, payout updates, replies to milestone-reward inquiries | rewards@takethewall.com |
| support@takethewall.com | Payment, wall, technical and content-report support replies | support@takethewall.com |
| contact@takethewall.com | General questions, business inquiries, and uncategorized correspondence | contact@takethewall.com |

Each sender includes a recognizable Take The Wall display name. The existing verified Resend domain and API key are reused; no additional secret or per-address environment variable is needed. Email templates, recipients, and unsubscribe behavior remain unchanged. Stripe's own payment receipt emails are configured separately in Stripe.

Both outboxes pin sender and Reply-To on the first delivery attempt so retries retain the same headers. Previously attempted jobs without a pinned sender use the existing `RESEND_FROM` and prior Reply-To behavior; keep that legacy variable unchanged until those jobs finish or leave their 23-hour retry window. New messages do not use it, and health checks no longer require it. Admin manual retries preserve the same routing snapshot.
