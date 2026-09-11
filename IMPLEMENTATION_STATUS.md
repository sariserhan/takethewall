# Implementation status

## Completed and verified

The V1 app and authorized consolidated enhancement spec are implemented locally. The user's explicit Better Auth choice replaces the earlier Clerk preference.

- Preserved one live wall, atomic payment activation, Stripe hosted Checkout, public realtime Convex counters, VisitorPing ingestion/reporting, Resend delivery, and Cloudflare DNS + Vercel deployment architecture.
- Fixed server-authoritative $3.99 price; website, app, social and personal/message placements; optional personal image; adaptive public CTA and preview.
- Paid-only takeover numbers, public IDs and canonical SHA-256 chain; house/moderation restorations do not increment paid totals. Bounded historical migration and public verification detect broken links and content changes.
- Configuration-driven milestones, all initial future routes, provisional candidates, deterministic unlimited sequential cascade and multiple rewards per takeover. Independent workflow/payout/promotion flags default off.
- Immutable versioned rule snapshots/hashes, frozen reached definitions, separate initial/additional-information deadlines, review time excluded, audited extensions and reminders.
- Protected winner links, fresh six-digit OTPs (ten minutes, five attempts, single use), hashed twelve-hour sessions, immediate revocation on link resend, private realtime portal/chat and eligibility checklist.
- Better Auth Convex component for admin email OTP; independent backend authorization on every admin function. No Clerk dependency or disabled-Clerk setting remains. Empty allowlists deny access.
- Admin overview, cursor-paginated takeover/milestone/claim/message/support/audit lists, last-message/unread information, claim review, additional information, moderation, Stripe payment/refund links, future settings, manual sent/confirmed payout states and audit records.
- Private requested documents: ten per claim, ten MB each, PDF/PNG/JPEG/WEBP signature checks, authorized direct uploads/downloads, access audit, deletion and documented retention overrides. Default cleanup ninety days after claim finalization/closure.
- Finalized trophy content freezes at confirmed payout; original-reign metrics freeze after replacement plus the existing 120-second late-event allowance. Later purchases do not overwrite trophies. Unsafe destinations can be disabled.
- Realtime candidate sequence overlay and mobile sheet, per-milestone session dismissal, homepage permanent-wall cards, public future/verification/finalized pages.
- About, Support, Contact, versioned Reward Rules, Terms, Privacy, Disclaimer and Disclosure pages; metadata, footer links and recorded purchase legal version. Private routes exclude analytics and use noindex/noarchive.
- Transactional claim/support queue behind an email-provider interface, retries and ten-minute coalesced unread-chat notifications. Stripe provider facade and signed refund/dispute processing.
- Periodic audit checkpoints and asynchronous OpenTimestamps receipt submission/retry. Public downloadable receipts are labelled submitted, never falsely labelled blockchain-verified.

## Verification evidence

- `npm run check`: lint, TypeScript, **90 unit/backend/route tests**, and production build pass.
- **14 Playwright tests pass**, covering desktop/mobile V1 interactions, uploads, drafts, personal placements, all new public pages, all five milestone routes, unknown-route 404, admin/claim access boundaries and absence of private-route analytics.
- Better Auth test exercises the actual Convex component's OTP sign-in/session endpoints with mocked email delivery and verifies OTP single use. Backend tests cover admin allowlisting, claims, OTP/session revocation, cascades, payout publication, snapshot freezing, private documents/retention, moderation, cursor pagination, rules immutability and audit tampering/migration.
- Local Convex watcher successfully deployed the final functions and schema. Local public audit/milestone smoke checks pass. Production server runs at `http://localhost:3001`.
- Desktop wall/admin and mobile milestone screenshots inspected: readable layout with no horizontal overflow. Browser plugin unavailable; Playwright uses existing host libraries.
- No real card charge, wire, external email, external timestamp confirmation, live VisitorPing delivery or production deployment is claimed.

## Remaining external launch work

1. Link the actual Vercel/Convex projects and isolated staging/production deployments. Configure Stripe keys/webhook (including refunds/disputes), VisitorPing ingestion/read credentials, verified Resend sender, support/privacy mailboxes, Better Auth/claim secrets and authorized administrator emails.
2. Run real Stripe test-mode Checkout/wallet/receipt, refund/dispute and transactional-delivery rehearsals. Verify authenticated document CORS/upload/download with the production origins, private-route exclusions, and two-browser realtime changes.
3. Supply operator legal identity/address, applicable jurisdiction and provider/data-transfer details. Review legal notices and reward/payout terms for that operator before enabling rewards, payouts or cash promotion. No legal facts were invented.
4. Configure Cloudflare DNS-only records from the actual Vercel project, verify HTTPS/domain redirects and production attribution, then activate the intended production controls.

## Decisions and practical limits

- Better Auth is the explicit user override. The earlier automatic-review rejection concerned a Clerk setting that was abandoned; it does not block this implementation.
- Public purchase and winner claims remain account-free. Better Auth is used for administrators; the spec-defined claim link + fresh OTP flow stays separate.
- Claim link tokens derive from a random nonce and a separate server secret, allowing reliable retries without storing raw link tokens. Database stores the nonce and token hash; OTP digests are keyed against offline guessing after a database-only leak.
- Required documents use dedicated storage; human-to-human claim messages use plain text, not an AI agent component.
- Dashboard queue totals explicitly cap at 100; complete lists are cursor-paginated. Conversation detail shows the latest 100 messages/audit entries. Gross daily revenue begins with this schema addition and is not a historical/net accounting report.
- Provider secrets are managed in deployment environment settings, not in admin-editable JSON. Future rule JSON is synchronized to authoritative configured amounts and deadlines.
- External anchoring stores standard detached `.ots` calendar receipts. Independent receipt upgrade/Bitcoin verification is an operator step documented in `DEPLOYMENT.md`; a calendar response alone is not proof of confirmed anchoring. No production anchoring has been enabled.
- The added legal wording defines permanent publication for the operating life of the service, subject to mandatory obligations. This clarification and fee/withholding language require operator review before launch; specified price, reward amounts and deadlines are unchanged.
- Historical migration is backward compatible, bounded and preserves original prices; existing deployments must complete it before new paid activation if the audit head is absent.
- Singleton counters and basic anonymous abuse controls match the current app; assess contention and abuse response with real production load.

Specification: [consolidated delta](docs/IMPLEMENTATION_DELTA.md). Deployment and verification procedures: [DEPLOYMENT.md](DEPLOYMENT.md).
