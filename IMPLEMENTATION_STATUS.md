# Implementation status

## Completed
- Entire one-page poster UI: real current owner, logo, domain, description, clickable ad, live reign timer, site/reign counters, CTR, top regions, mobile CTA, preview sheet, accessible dialogs, cancellation draft recovery, and legal information.
- Next.js App Router, TypeScript, Tailwind, locally hosted fonts, optimized logo, social image, security headers and error recovery.
- Convex schema, internal payment/operations functions, one public projected query, monotonic atomic activation, previous-owner replacement, event/session/payment idempotency, test/live separation.
- Controlled logo upload with MIME/extension/size checks, actual decode, pixel limits, metadata stripping, normalization, bounded request streaming and storage cleanup.
- Stripe hosted Checkout with fixed price, email prefill, raw-body signature verification, receipt-email separation, successful asynchronous confirmation and verified expiry handling.
- Opaque hashed expiring confirmation tokens, URL stripping, pending/active/replaced/invalid/expired states and delayed-confirmation retry.
- Site lifetime/UTC day/reign deduplication; foreground/page/reign impression identity; signed short-lived attribution contexts; bounded late events; unique click identities; bot/development exclusion; trusted country; rate limits.
- Real VisitorPing ingestion contract with stable delivery UUIDs, sanitized metadata and anonymous browser attribution; six required event names; independent retry outbox.
- Resend transactional templates, original purchase contact, recorded-event wording, retry/deduplication, bounded provider idempotency window and operation-visible failures.
- Private moderation, fresh restoration reigns, immutable historical paid reigns, operator references, refund-reference inspection, contact deletion and retention cleanup.
- Local anonymous Convex deployment, private local secrets, original VisitorPing house seed and actual zero paid-takeover counters.
- 59 unit/backend/route tests passed. All 8 desktop/mobile Playwright tests passed against the production build at http://localhost:3001. Lint, typecheck, production build, and actual local Convex deployment passed. Final screenshots show no overflow or console errors.

## In Progress
- External launch configuration only; implementation and local verification are complete.

## Remaining
- Configure the actual Vercel/Convex production targets, Stripe test/live credentials, TakeTheWall VisitorPing site key, and verified Resend sender.
- Execute external Stripe test-mode Checkout/wallet/receipt end-to-end tests and live-service delivery checks.
- Deploy and verify takethewall.com, HTTPS, production webhook, support/privacy mailboxes, and production traffic attribution before enabling live payments.

## Known Issues
- No production service configuration was supplied. No live deployment, real charge, external email, or VisitorPing delivery is claimed.
- Convex connector repeatedly requested authentication; the standard local anonymous deployment works.
- Browser plugin is unavailable. Playwright ran using existing host libraries. The image viewer sandbox fails at startup; screenshots were inspected through the image channel using the shell-read fallback.
- Anonymous browser metrics and simple content filtering are best effort. Site-wide singleton counters suit the specified small V1; reevaluate contention with real load.

## Decisions
- Use the spec's off-white typographic poster and chartreuse accent, with the actual VisitorPing logo replacing the concept's generic mark.
- Native HTML dialogs provide focus trapping and keyboard dismissal; no additional UI library is needed.
- All privileged mutations remain internal. Next.js uses a protected Convex HTTP gateway; browsers cannot increment counters or activate purchases directly.
- Use VisitorPing's supported ingestion contract rather than its automatic tracker because the latter captures full outbound URL queries. Public metrics remain Convex-owned.
- Preserve unresolved Stripe sessions during cleanup so payment failures can be reconciled. Remove only unreferenced or authoritatively abandoned assets; never delete historical paid creative.
- No features from the spec's future-only list were added.
