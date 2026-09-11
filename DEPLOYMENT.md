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
| `STRIPE_PRICE_ID` | Vercel, optional | Existing one-time 299-cent USD price in matching mode |
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
- Configure Stripe's endpoint as `https://takethewall.com/api/webhook`, with `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.expired`. Install that endpoint's signing secret in Vercel and enable Stripe receipts.
- Verify the TakeTheWall Resend sender and make `support@takethewall.com` and `privacy@takethewall.com` operational.
- Configure the VisitorPing website for `takethewall.com`, its ingestion key, site-scoped read API key, and website ID. The existing server event pipeline sends sanitized events; adding the automatic tracker would duplicate collection.
- After staging payment verification, enable production metrics in both Vercel and Convex and redeploy Vercel to apply its environment changes. The metrics switch does not disable Checkout; control payment availability through deployment exposure and Stripe configuration.

The VisitorPing read cron runs every 30 seconds, with one shared lease and two filtered API calls per successful refresh. It preserves last successful reports on failures and backs off on provider errors. Inspect the `visitorPingReports` table or run `npx convex run --prod visitorping:report '{}'` for the window, timestamp, totals, last error, and next attempt. Null means no successful report for the current owner. Missing configuration leaves polling idle. Public realtime/lifetime counters and country attribution remain in Convex; API reports are private operational analytics over at most 24 hours. See the [VisitorPing API contract](https://visitorping.com/developers/analytics-api).

## 5. Launch verification

- Run `npm run check`; complete the documented browser tests against the local build.
- In isolated staging, exercise successful, cancelled, delayed, and duplicate Stripe deliveries. Verify the exact $2.99 USD price, receipts, activation/replacement email, and two-browser ownership updates.
- In production, verify HTTPS, canonical redirect, webhook configuration, initial house creative, and exclusion of preview/test traffic.
- Observe a real visible impression and click: confirm sanitized ingestion, successful VisitorPing report refresh, and trusted request-country attribution. API ingestion is eventually consistent; compare matching time windows and event definitions.
- Confirm failed delivery jobs and stale analytics reports are visible to operators. Provider failures must leave ownership and payment activation operational.

## Current readiness

Code and local verification are prepared. Actual project linking, production secrets, DNS records, provider delivery, and external payment checks remain to be completed with the real accounts. This document does not claim a live deployment.
