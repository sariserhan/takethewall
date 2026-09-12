# Sharing, referrals, history and search

## Owner sharing

Verified Stripe completion and payment-return confirmation both show the purchased takeover's share card, even if another owner has already replaced it. Owners can share or copy the public link, copy a caption, and download landscape, square or portrait cards. Private owner credentials never appear in shared links or QR codes.

Public tracked link: `/takeover/ttw_…?via=share`. Cards encode that link in their QR code. The owner dashboard shows unique referred browsers and attributed paid takeovers separately from clicks to the owner's destination.

Attribution uses the last eligible tracked link visited within 30 days. A signed HTTP-only, SameSite=Lax cookie records the source; it is captured when checkout starts, so retries cannot change attribution. Unique referred browsers are deduplicated per source using a separately keyed browser identifier. Browser storage resets and different devices may count again. Client visibility and production/bot filters apply. Paid counts are credited atomically with verified live Stripe activation; duplicate callbacks, test payments and matching buyer-email self-referrals are excluded. These are historical paid activation counts, not net revenue or proof of incremental sales. No retroactive traffic is invented.

No new environment variables are required. Production measurement uses the existing `PUBLIC_METRICS_ENABLED=true`, `WALL_ENVIRONMENT=production`, and Vercel production context; both server layers must be configured. Existing `WALL_TOKEN_SECRET` signs the cookie. Development and preview traffic is excluded.

## Admin Growth tab

Open `/admin`, select **growth**, and choose a takeover. The social kit provides its image formats, public link and prepared caption. Review and publish manually; the app does not post to social networks.

**Show Wall History publicly** is on by default. Switch it off to remove public history navigation and the archive's sitemap entry; `/history` renders the not-found page with `noindex`, and `/api/history` returns 404. Next.js may return HTTP 200 for a streamed not-found page; no archive content is included. The setting persists in Convex and is administrator-only to change. Existing browser tabs refresh navigation visibility on focus; new loads use the current setting. Admin history tools remain available while hidden. Individual share pages and approved individual search pages remain available, and the compact previous-owner stat is unaffected.

Search approval requires reviewing the content/destination and writing an original 120–2,000-character editorial overview. The overview appears on the public page. Unreviewed pages use `noindex,follow`; approval enables indexing eligibility and adds the canonical URL to a sitemap. Owner content edits invalidate approval until reviewed again. Blocked content and disabled destination links are excluded from search eligibility. Approval is audit logged. Approval never guarantees search inclusion.

## Public history

`/history` lists public recorded placements with project details, original activation dates, and completed reign durations. Pagination reads bounded activation-sequence ranges. It does not expose checkout emails, private dashboard links, or demo additions. Moderated/pending/rejected records are excluded; moderation restoration copies are not duplicated in the archive.

## Search Console after deployment

`/sitemap.xml` covers the homepage, visible history archive and milestone pages. Approved takeover URLs appear in `/takeover-sitemap-0.xml`, then additional numbered shards as needed. Root-level rewrites keep these sitemap URLs within the correct directory scope. `/robots.txt` advertises the current set. Canonicals exclude referral parameters; paid destination links use `rel="sponsored nofollow"`.

After the production backend and app are deployed, submit the sitemap URLs listed in robots.txt in the domain's Search Console property, then inspect a reviewed takeover URL. Google supports sitemap submission and robots.txt discovery; submission does not guarantee indexing. See [Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) and [URL Inspection](https://support.google.com/webmasters/answer/9012289?hl=en).

Search Console access is not connected to this workspace. No sitemap submission, Google indexing, social publishing, production deployment or traffic increase was claimed or performed in this implementation.

## Verification

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.

After building, run `node scripts/test-growth-browser.mjs`. It serves isolated public-content fixtures for SSR, runs desktop/mobile sharing and admin checks, then switches the fixture archive off and verifies the public not-found state, API 404, missing navigation and sitemap exclusion. It does not create database records or send emails. Growth browser specs intentionally skip without this fixture harness; Convex tests independently verify actual authorization, visibility persistence, attribution and indexing behavior.
