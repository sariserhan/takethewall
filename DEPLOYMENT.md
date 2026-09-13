# TakeTheWall deployment

Agreed architecture: Cloudflare manages DNS, Vercel serves the Next.js app, Convex owns application state and realtime counters, and VisitorPing collects events and provides aggregate reports. Stripe handles Checkout; Resend sends transactional email.

## 1. Project targets and environment isolation

Create/link the intended Vercel and Convex projects. Keep local development, Stripe test-mode staging, and live production in separate Convex deployments. Use a staging hostname and test Stripe keys for the external payment rehearsal. Keep `PUBLIC_METRICS_ENABLED=false` there. Do not point Vercel Preview builds at production data.

The checked-in Vercel build command is `npx convex deploy --cmd 'npm run build'`. Scope `CONVEX_DEPLOY_KEY` to the matching Vercel environment. Convex supplies `NEXT_PUBLIC_CONVEX_URL` during this build; verify the build points at the intended deployment. Configure its matching HTTP action origin as `CONVEX_HTTP_URL`.

Reference: [Convex deployment on Vercel](https://docs.convex.dev/production/hosting/vercel).

## 2. Configuration placement

Store secrets in provider environment settings. `.env.example` documents variable names and is not a source of real credentials.

| Variable | Where | Production value or purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Vercel | `https://takethewall.com` |
| `NEXT_PUBLIC_CONVEX_URL` | Vercel build | Correct production Convex client URL |
| `CONVEX_HTTP_URL` | Vercel | Matching Convex HTTP action URL, ending in `.convex.site` |
| `CONVEX_DEPLOY_KEY` | Vercel build | Production deployment key, Production scope only |
| `WALL_SERVER_SECRET` | Vercel and Convex | Same random secret, at least 32 characters |
| `WALL_TOKEN_SECRET` | Vercel | Separate stable random secret, at least 32 characters |
| `WALL_ENVIRONMENT` | Vercel and Convex | `production` with live Stripe keys; `test` in isolated staging |
| `PUBLIC_METRICS_ENABLED` | Vercel and Convex | `false` during preparation; `true` at production launch |
| `STRIPE_SECRET_KEY` | Vercel | Matching live/test mode secret |
| `STRIPE_WEBHOOK_SECRET` | Vercel | Signing secret for that environment's webhook endpoint |
| `STRIPE_PRICE_ID` | Vercel, optional | Existing one-time 399-cent USD price in matching mode |
| `RESEND_API_KEY`, `RESEND_FROM` | Convex | Email credentials and verified TakeTheWall sender |
| `VISITORPING_SITE_KEY` | Convex | Actual `vp_XXXXXXXX` ingestion key for this website |
| `VISITORPING_API_KEY` | Convex | Private Analytics API key scoped to this website |
| `VISITORPING_SITE_ID` | Convex | Website ID from the authenticated `/api/v1/sites` response |
| `BLOCKED_DOMAINS` | Vercel | Optional comma-separated blocked submission domains |

Vercel sets `VERCEL_ENV` automatically; production event counting additionally requires it to equal `production`. Never prefix private keys with `NEXT_PUBLIC_`. Keep the public ingestion key, private read key, and website ID distinct. API access requires an eligible VisitorPing plan and an unexpired key. Rotate the read key by setting its replacement in Convex before revoking the old key.

## 3. Cloudflare DNS and Vercel domains

1. Add `takethewall.com` and `www.takethewall.com` to the intended Vercel project. Set `www` to redirect to `https://takethewall.com` in Vercel.
2. Copy the **exact record type and target shown by Vercel** for each hostname into Cloudflare DNS. Do not guess project-specific targets. Replace conflicting web records for those hostnames only.
3. Set app A/AAAA/CNAME records to **DNS only (gray cloud)**. Keep Cloudflare nameservers. Preserve email MX, SPF, DKIM, DMARC, and unrelated records. Add ownership-verification TXT records if Vercel requests them.
4. Verify Vercel reports valid domain configuration, provisions HTTPS, and serves both apex and the `www` redirect correctly.

Cloudflare is the DNS provider for this setup; traffic goes directly to Vercel's CDN. Cloudflare proxy/WAF rules will therefore not protect these app hostnames; use Vercel's traffic controls when needed. No Cloudflare API token is required by the app. Do not enable an additional analytics script for this launch.

References: [Vercel external DNS setup](https://vercel.com/docs/domains/set-up-custom-domain), [Cloudflare in front of Vercel](https://vercel.com/kb/guide/cloudflare-with-vercel).

## 4. Payment, email, and analytics activation

- Seed the production house creative once through internal deployment tooling using `public/visitorping.png`. Do not import local purchases, visitors, or test counters into production.
- Configure Stripe's endpoint as `https://takethewall.com/api/webhook`, with `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`, and `charge.dispute.created`. Install that endpoint's signing secret in Vercel and enable Stripe receipts.
- Verify the TakeTheWall Resend sender and make `support@takethewall.com` and `privacy@takethewall.com` operational.
- Configure the VisitorPing website for `takethewall.com`, its ingestion key, site-scoped read API key, and website ID. The existing server event pipeline sends sanitized events; adding the automatic tracker would duplicate collection.
- After staging payment verification, enable production metrics in both Vercel and Convex and redeploy Vercel to apply its environment changes. The metrics switch does not disable Checkout; control payment availability through deployment exposure and Stripe configuration.

The VisitorPing read cron runs every 30 seconds, with one shared lease and two filtered API calls per successful refresh. It preserves last successful reports on failures and backs off on provider errors. Inspect the `visitorPingReports` table or run `npx convex run --prod visitorping:report '{}'` for the window, timestamp, totals, last error, and next attempt. Null means no successful report for the current owner. Missing configuration leaves polling idle. Public realtime/lifetime counters and country attribution remain in Convex; API reports are private operational analytics over at most 24 hours. See the [VisitorPing API contract](https://visitorping.com/developers/analytics-api).

## 5. Launch verification

- Run `npm run check`; complete the documented browser tests against the local build.
- In isolated staging, exercise successful, cancelled, delayed, and duplicate Stripe deliveries. Verify the exact $4.99 USD price, receipts, activation/replacement email, and two-browser ownership updates.
- In production, verify HTTPS, canonical redirect, webhook configuration, initial house creative, and exclusion of preview/test traffic.
- Observe a real visible impression and click: confirm sanitized ingestion, successful VisitorPing report refresh, and trusted request-country attribution. API ingestion is eventually consistent; compare matching time windows and event definitions.
- Confirm failed delivery jobs and stale analytics reports are visible to operators. Provider failures must leave ownership and payment activation operational.

## Current readiness

Code and local verification are prepared. Actual project linking, production secrets, DNS records, provider delivery, and external payment checks remain to be completed with the real accounts. This document does not claim a live deployment.


## Administrator authentication and reward operations

Better Auth replaces the original Clerk preference. Set `BETTER_AUTH_SECRET` (random, stable, 32+ characters), `SITE_URL` (the exact application origin), and `ADMIN_EMAILS` (comma-separated verified administrator emails) on Convex. Set `NEXT_PUBLIC_CONVEX_SITE_URL` on Vercel to the matching `.convex.site` HTTP origin. The existing `CONVEX_HTTP_URL` is also used as a server-side fallback. Configure Resend before signing in at `/admin`: Better Auth emails a six-digit, ten-minute, single-use code. Public buyers do not register. An empty allowlist denies administrator access. `ADMIN_USER_IDS` optionally allowlists existing authenticated subjects; it does not bypass email sign-in restrictions.

Set a separate stable `CLAIM_TOKEN_SECRET` on Convex (random, 32+ characters). Claims use independently generated protected links, fresh email OTPs and 12-hour sessions. Resending a link immediately invalidates old links, OTPs and sessions. Private documents upload directly to the authenticated Convex HTTP route to support the 10 MB limit without Vercel request-body limits; downloads pass through the private proxy. Confirm the production `SITE_URL` CORS origin matches the browser origin exactly.

The three Convex flags default off: `MILESTONE_REWARDS_ENABLED`, `MILESTONE_PAYOUTS_ENABLED`, `MILESTONE_PUBLIC_PROMOTION_ENABLED`. Once a settings record is saved in `/admin/settings`, that record is authoritative and overrides environment defaults. Workflow, payout and promotion remain independent. Existing reached obligations retain their rule versions and deadlines. Configure future milestone amounts/deadlines with a new rules version; reached values and published versions cannot be overwritten. Published rules JSON includes the actual configured amounts and deadlines. Provider credentials remain in deployment environment settings, never in browser-editable JSON.

Manual payout: review submitted identity/eligibility and requested documents → approve with a reason → send the wire externally → record the reference as sent → confirm receipt/payment. Only the final confirmation publishes a trophy. Before disqualifying a sent-wire claim, reconcile the payment. Refunds are performed in Stripe through the admin payment link; signed refund/dispute webhooks handle claim succession or post-payment review. No automatic bank transfers or clawbacks occur.

Requested documents default to deletion 90 days after payout or claim closure. Admins can delete them earlier or record a reason and explicit retention deadline. Access, upload, deletion and overrides are audited. Claim chat is private, plain text, rate limited and uses ten-minute coalesced email notifications. `/admin/messages` and `/admin/support` expose the operational queues. Dashboard queue counts are explicitly bounded at 100; lists use cursor pagination. Gross daily revenue is recorded from new verified activations and excludes historical records predating this field; it is not net accounting revenue.

## Historical migration and independent audit checks

For an existing deployment, export a backup, then repeatedly run `npx convex run auditTrail:migrate '{}'` until `done: true` (add `--prod` only for the verified production target). Migration processes 100 activation records per batch, preserves original payment amounts, excludes house/restoration reigns, and checks the paid total. New activation is blocked while historical numbering is incomplete. A fresh deployment needs no migration.

Use `auditTrail:entries` with `{ "after": 0 }`, then its `next` value, to export public canonical audit records. `auditTrail:verify` checks sequential numbering, prior hashes, content hashes and linked takeover records in batches of 100; continue through `next`. The public projection contains no buyer, claim, document or payment-provider identifiers. Independently retain exports/checkpoint hashes: a database owner could otherwise rewrite an entire chain.

Checkpoints are created after 100 further activations or 24 hours when the chain has advanced. Set `AUDIT_ANCHORING_ENABLED=true` on Convex to submit checkpoint digests asynchronously to the OpenTimestamps calendar. `auditTrail:checkpoints` exposes download URLs for `.ots` receipts. `submitted` means calendar receipt received, **not independently verified Bitcoin confirmation**. Save the proof and original checkpoint hash, then use an independent OpenTimestamps client to upgrade and verify the proof against that SHA-256 digest. Calendar outages retry without blocking payment activation. The app does not automatically upgrade receipts or claim blockchain verification.

Protocol/reference tools: [OpenTimestamps](https://opentimestamps.org/), [JavaScript proof format](https://github.com/opentimestamps/javascript-opentimestamps).

## Legal publication inputs

Terms, Privacy, Disclaimer, Disclosure and versioned Reward Rules are implemented. Before public reward launch, supply the operator's legal identity/address and applicable jurisdiction, confirm provider/data-transfer arrangements and jurisdiction-specific notices, and have the reward/payout rules reviewed for the actual operator. These facts were not provided and are not invented in the copy. Confirm any permanent-placement wording and payout withholding/fee disclosures. Keep reward promotion and payouts disabled until the operator completes this review and external staging verification.


## Resend delivery webhooks

The implemented endpoint is `https://takethewall.com/api/webhooks/resend`. Set its signing secret as `RESEND_WEBHOOK_SECRET` in Vercel (and `.env.local` for local tests). Subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, and `email.suppressed`; `email.scheduled` is also supported. `email.received` is acknowledged but ignored because inbound-mail handling is not implemented.

The handler verifies the unmodified request body with Svix, rejects stale/invalid signatures, bounds payload size, and records only the email ID, event type and event time in the protected admin audit log. Duplicate event IDs are idempotent; out-of-order events remain separate historical entries. It does not store email bodies, recipients, OTPs or claim links, and it does not automatically resend failed messages or create a suppression list. Persistence failures return 500 for provider retry. The signing secret belongs in Next.js/Vercel; sending credentials remain in Convex.

## Embedded Stripe Checkout

Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` on Vercel (and locally for rehearsal): `pk_test_…` with test keys, `pk_live_…` with live keys. It must belong to the same Stripe account as STRIPE_SECRET_KEY. The API validates the environment prefix before creating a purchase.

Checkout is embedded in the purchase overlay. Sessions use `ui_mode=embedded_page`, `redirect_on_completion=if_required`, and the existing opaque return-token URL for payment methods requiring redirects. Client secrets are returned only in a no-store API response and held in browser component memory. The server stores the session ID; retried creation uses the same Stripe idempotency key. Existing hosted sessions remain valid and are not modified.

The client completion callback waits for `/api/status`; only the existing verified Stripe webhook activates a takeover. No new webhook event subscriptions are needed. See [Stripe embedded Checkout](https://docs.stripe.com/checkout/embedded/quickstart?client=react) and [redirect behavior](https://docs.stripe.com/payments/checkout/custom-success-page?payment-ui=embedded-form).

Embedded Checkout validation: 105 unit/backend tests plus desktop/mobile browser tests with a simulated Stripe SDK and delayed server activation passed. A real Stripe iframe/payment rehearsal is pending the matching publishable key. The simulated tests do not validate card entry, wallets or 3DS with Stripe.


## 2026-09-12 Neon compute protection

External VisitorPing report polling was paused in production `canny-bee-832` by
removing `VISITORPING_SITE_ID`. Existing snapshots, local metrics and event delivery
remain intact. Restore `VISITORPING_SITE_ID=ca77b849-ffff-4b44-9d67-ffa2577da2e2`
only after the 15-minute cron and successful-refresh cooldown are deployed.
The production dry run also proposed seven unrelated indexes and a Node runtime
update, so the full backend was not deployed as part of this focused cost fix.
The 15-minute schedule reduces scheduled aggregate API calls from up to 5,760
per day to 192, independently of browser count. Live event ingestion can still
keep Neon awake; these savings are request counts, not a compute quota guarantee.
