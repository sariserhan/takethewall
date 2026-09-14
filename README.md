# Take The Wall

**One page. One owner. The next takeover replaces it.**

[See who owns the wall →](https://takethewall.com/)

Take The Wall is a public internet experiment. A website, app, social profile, or message occupies the wall until someone else takes it over. What would you put there?

Browsing is free. A verified $4.99 USD purchase replaces the current owner; there is no guaranteed duration or audience.

<!-- founder-pilot -->
## Try the three-founder pilot

I’m looking for three founders to put their projects on the wall and try sharing their referral links. No purchase is required: the official free email-entry route is available, subject to review. No guaranteed audience or time on the wall; the next activated takeover replaces yours.

[Read the pilot invitation and entry details](https://github.com/sariserhan/company-operator/blob/main/marketing/takethewall/founder-pilot/INVITATION.md) · [Try your design](https://www.takethewall.com/?take=1&utm_source=github&utm_medium=community&utm_campaign=three_founders&utm_content=project_readme)

Interested? Email **contact@takethewall.com** with subject **Founder pilot** and your project URL. This expresses interest; it is not automatic entry or a reserved slot. A sharing window will be agreed after participants are confirmed. The pilot adds no separate prize; existing rewards follow the [Reward Rules](https://www.takethewall.com/?info=rewards).
<!-- /founder-pilot -->

## Run locally

Requires Node.js 22+ and npm. No consumer authentication exists.

```sh
npm ci
npx convex dev
```

Keep Convex running. In another terminal:

```sh
node scripts/configure-local.mjs
npm run dev -- --port 3001
```

Open http://localhost:3001. The setup script accepts **local anonymous Convex deployments only**, generates local server secrets, and seeds the actual VisitorPing house creative. It never creates service credentials or enables public metrics. It is safe to repeat. `.env.local` and `.convex/` are ignored by Git.

Copy the relevant variables from `.env.example` into Next.js and Convex configuration. The local Convex CLI supplies `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`; the latter is the local fallback for server-only `CONVEX_HTTP_URL`. Set the exact site origin, including port, in `NEXT_PUBLIC_SITE_URL`.

## Payments and services

- **Next.js:** Stripe secret key, webhook secret, optional existing Price ID, `WALL_TOKEN_SECRET`, `WALL_SERVER_SECRET`, `CONVEX_HTTP_URL`, `NEXT_PUBLIC_SITE_URL`, and `WALL_ENVIRONMENT`.
- **Convex:** the same `WALL_SERVER_SECRET` and `WALL_ENVIRONMENT`, plus `RESEND_API_KEY`, `VISITORPING_SITE_KEY`, `VISITORPING_API_KEY`, `VISITORPING_SITE_ID`, and `PUBLIC_METRICS_ENABLED`.
- **Both:** set `PUBLIC_METRICS_ENABLED=true` only on a dedicated production deployment. Next.js additionally requires `VERCEL_ENV=production` to accept production traffic. All local/preview traffic remains excluded. Test and live payments must use separate Convex deployments.
- Stripe keys are checked against `WALL_ENVIRONMENT` before Checkout creation. The price is server-owned: 399 cents, USD, one time. No promotional codes or adaptive pricing. Dynamic hosted Checkout methods permit supported wallets configured in Stripe.
- Enable Stripe payment receipts in its Dashboard. The buyer email prefills Checkout; the final receipt email is kept separately. Resend activation/replacement messages go to the original purchase contact, never to a public profile.
- New email senders are mapped by purpose in `lib/email-routing.ts`. Keep existing `RESEND_FROM` only for legacy in-flight retries; it no longer controls new emails.
- Use a verified **TakeTheWall sender**, not another project's sender. Configure support@takethewall.com and privacy@takethewall.com before launch.

Forward test webhooks with the Stripe CLI:

```sh
stripe listen --forward-to localhost:3001/api/webhook
```

Set the resulting signing secret in Next.js. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.expired`. Only verified successful payment activates ownership. A success URL never does. Test duplicate delivery, concurrent Checkouts, unsuccessful payments, cancellation, and delayed returns with Stripe test mode before live rollout.

## VisitorPing contract

Custom events use `window.VisitorPing?.track(...)` in the visitor’s browser, sharing the tracker’s existing visitor/session identity. Convex does not POST to VisitorPing ingestion or synthesize a browser Origin. The first-party event endpoint still maintains authoritative counters independently; payment activation, audit records, revenue and email delivery remain server-side.

The four existing events (`wall_impression`, `wall_owner_link_click`, `take_wall_clicked`, `takeover_activated`) retain their names and public properties (`takeoverId`, `ownerDomain`, sanitized `destination`, and browser-event `country`). Checkout start/completion reporting also uses the browser. Verified activation is reported only after the status endpoint confirms a production purchase, once per takeover per tab session. A bounded 15-second queue handles asynchronous tracker loading; blocked trackers do not interrupt the app. Delivery uses no buyer email, checkout token, synthetic visitor ID or synthetic session ID.

Old analytics jobs drain without network delivery. The legacy `VISITORPING_SITE_KEY` backend variable is no longer required. The separate analytics read API still uses its private read key. CSP permits `wss://realtime.visitorping.com` for live chat. Historical aggregate reads retain `traffic=all` to include previously recorded relay events; existing phantom sessions are not deleted by this change.

The automatic tracker script is intentionally not loaded: its current automatic outbound-link capture includes full destination query strings. Using supported ingestion preserves the spec's privacy boundary. All six required event names are delivered. URL query strings, fragments, credentials, email, purchase-status tokens, and Stripe references are excluded. Provider-side geographic inference can reflect server delivery; use the explicit country metadata and Convex counters for public attribution.

The [Analytics API](https://visitorping.com/developers/analytics-api) is integrated through an internal Convex action. Configure `VISITORPING_API_KEY` and `VISITORPING_SITE_ID` in Convex. A shared 15-minute cron reads current-takeover impressions/uniques and clicks, bounded to the most recent 24 hours or activation time, whichever is later. Requests use exact `takeoverId` filters and exclude classified bots. Reports retain the last complete successful result on failure, honor `Retry-After`, back off with jitter, and discard responses if ownership changes during the read. The cron is idle outside production or without configuration. Successful refreshes are at least 15 minutes apart. This operator report does not power public realtime counters.

Reports are operator-only and include their time window and fetch timestamp. They are not added to public Convex counters. Country breakdowns are not consumed because provider session geography can reflect server forwarding; public country attribution continues using trusted Vercel request metadata. A cached report can be stale and is never a lifetime count or an ingestion-completeness guarantee.

```sh
npx convex run visitorping:report '{}'
```

Use `--prod` only for the intended production project. See [DEPLOYMENT.md](DEPLOYMENT.md) for the Cloudflare/Vercel setup, environment placement, and launch sequence.

## Operations (deployment credentials only)

Use Convex Dashboard tables/functions or the CLI. There is no public admin page or public write mutation.

```sh
npx convex run operations:recent '{}'
npx convex run operations:disable '{"expectedCurrentId":"TAKEOVER_ID","reason":"Policy violation","operatorReference":"incident-unique-reference"}'
npx convex run jobs:replay '{"id":"FAILED_JOB_ID"}'
npx convex run operations:deleteContact '{"purchaseId":"PURCHASE_ID"}'
```

For production add `--prod`, after checking the target. Moderation uses an expected-current ID to avoid removing a different purchaser during a race, records an append-only transition, and creates a fresh restoration reign. Paid totals and original historical timestamps are unchanged. Refunds are performed explicitly in Stripe using the private payment reference from `operations:recent`; refunds never silently restore prior ownership.

Inspect `jobs` for `failed`, attempts, next retry, and redacted provider error. Email retry is bounded to 23 hours so it stays inside [Resend's 24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). After that, reconcile provider delivery before a manual send. Missing configuration or delivery failures cannot roll back activation. Cron runs delivery and bounded cleanup each minute. Alert on failed jobs, persistent pending purchases, webhook 5xx, and an uninitialized wall using the hosting/provider monitoring tools.

For a paid-but-pending report, retrieve the Checkout Session in Stripe, confirm amount/mode/environment, and resend its signed success event. Do not activate based on a screenshot, return URL, or customer statement. Investigate or refund through Stripe if activation cannot be recovered.

## Retention and abuse limits

- First-party browser identifiers are hashed before persistence. Site lifetime, UTC day, and reign uniqueness are independent. A page instance counts once per displayed reign, even across reconnects. Contexts expire after 5 minutes; late events can finalize their original reign for up to 2 minutes after replacement. Click retries reuse event IDs; distinct clicks can produce CTR above 100%.
- Uploads: 6/IP/hour and 120 globally/hour; 2 MB input, decoded to at most 16 million pixels, resized to 512 px and normalized to WEBP without input metadata. Streaming bodies are bounded even without `Content-Length`. No backend request fetches buyer page contents.
- Checkout: 15/IP/hour; pending submissions: 10/IP/hour and 300 globally/hour. Contexts: 90/IP/minute; ingestion: 180/IP/minute plus 90 events/visitor/minute and 20 clicks/visitor/minute. Status: 40/IP/minute. Email dispatch: 50/minute. This is best-effort anonymous abuse resistance, not a human identity guarantee.
- Unreferenced upload cleanup: 48 hours. Pending creatives with no session, or a verified expired session: eligible 48 hours after the relevant expiry boundary. Unresolved Stripe sessions are preserved for reconciliation; paid historical assets are never deleted by cleanup.
- Event receipts: 48 hours; daily visitor deduplication: 3 days. Lifetime/reign hashed deduplication and historical aggregates remain. Contact data: 30 days unpaid, one year paid, extended while active. Administrative contact deletion is supported. Review payment-reference retention for actual payment-operations and applicable recordkeeping requirements before launch.
- `BLOCKED_DOMAINS` plus obvious-content checks reject known bad submissions; basic internal moderation handles reports. Anonymous ads still require operational review and response.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Playwright tests require the running, locally seeded app at port 3001 (override `TEST_BASE_URL`). Install Chromium with `npx playwright install chromium` and its host dependencies where needed. Unit tests use `convex-test`, real Stripe signature construction, and actual image decoding. No tests send real email or charge cards.

## Production deployment

The repository is prepared for Vercel and Convex production using [Convex's Vercel workflow](https://docs.convex.dev/production/hosting/vercel). `vercel.json` deploys Convex before the Next.js build. Configure `CONVEX_DEPLOY_KEY` for the intended production project in Vercel, scoped to Production; use a separate preview deployment key for Preview builds; never expose it to client code. Configure all provider variables and set `NEXT_PUBLIC_SITE_URL=https://takethewall.com`. Seed the production house once with the internal bootstrap action and the bundled logo (deployment-admin tooling only).

Before enabling live payments: complete Stripe test-mode end-to-end tests, check HTTPS and domain assignment, verify the production webhook destination and mode, confirm wallet availability, sender verification, support mailboxes, VisitorPing site key, realtime updates in two browsers, and exclusion of development traffic. Deployment and live-service checks remain incomplete until those project credentials and targets are configured. See `IMPLEMENTATION_STATUS.md` for current evidence.


## Milestones, claims, and administration

The authorized delta adds website/app/social/personal content, $4.99 paid-only numbering, configuration-driven milestones, deterministic claim succession, immutable rule versions and public trophy pages. Administrator sign-in uses **Better Auth with the Convex component**, email OTP and a backend allowlist. Winner access remains account-free through protected claim links and fresh email codes.

Visit `/admin` for operations; `/reward/portal` requires a verified claim session. Public pages include `/about`, `/support`, `/contact`, `/rewards`, `/terms`, `/privacy`, `/disclaimer`, `/disclosure`, and the five initial milestone routes. See [the consolidated spec](docs/IMPLEMENTATION_DELTA.md), [implementation status](IMPLEMENTATION_STATUS.md), and [deployment instructions](DEPLOYMENT.md) for configuration, historical migration, audit verification, reward activation and launch dependencies.
