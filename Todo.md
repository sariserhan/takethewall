# Take The Wall — Growth roadmap

## Implemented

- [x] Ownership badge endpoint with live/past-owner states; copyable Markdown and HTML in the published share dialog, owner dashboard, and public placement page. Public links only; no owner credentials. Short cache lifetime; external image caches may delay updates.
- [x] Completed-reign cards in landscape, square, and portrait: dark styling, recorded duration, unique visitors, outbound clicks, and a QR link. Existing live placement cards remain available. Cards reflect recorded counters at export, not an immutable analytics snapshot.
- [x] Existing admin social post kit offers reviewed captions and downloadable images. Existing Hall of Fame has an independent admin visibility toggle, defaults off, and excludes demo additions/test purchases.

- [x] Crumbling Wall: admin-controlled homepage posters for past production placements, bounded Load More, and respect for the main history visibility switch.
- [x] Hacker terminal: keyboard shortcut and mobile button, public live stats, a small command set, and prefilled checkout requiring normal review/payment.
- [x] Community hour: admin-configured UTC schedule, public countdown, title, description, and visibility control. Normal prices and reward rules remain in effect.
- [x] Gazette newsroom: fact-based draft generation for completed UTC days, optional automatic drafts at 00:05 UTC, editable headline/story, source links, revision checks, explicit publication/withdrawal, and public visibility control.

## Next: controlled X and Farcaster publishing

- [ ] Connect the official accounts: obtain X API credentials/write access and a Farcaster account with an approved signer/provider configuration. Check current provider pricing and posting limits.
- [ ] Add independent admin toggles (off by default), preview/approval controls, pause switch, delivery history, and manual retry.
- [ ] Enqueue one post per eligible production activation with an idempotency key. Retry transient failures with backoff; never post test placements or publish removed/blocked content. Posting failure must not affect payment or activation.
- [ ] Publish approved content and the public placement link. Do not include buyer email or protected owner URLs. Do not automatically tag owners until platform-compliant consent/opt-out handling exists.
- [ ] Bound post frequency, deduplicate rapid replacements, and track visits/purchases from each platform. Do not claim automatic sharing, guaranteed virality, or free API access.
- [ ] Verify end-to-end against test accounts before enabling production publishing; obtain authorization for actual external posts.

## Experiments after measuring badge/card sharing

- [ ] Spectator reactions: limited positive emoji set, per-session/IP rate limits, aggregated short-lived events, reduced-motion support, and an admin switch. Do not count reactions as visitors, reward entries, or verified referrals. Keep animations outside the ad and checkout.
- [ ] Community tags and daily leaderboard: optional moderated tags, actual time-on-wall accounting split at UTC day boundaries, anti-abuse controls, no extra cash prizes. Start when enough real activity exists to make the leaderboard useful.
- [ ] Five-second voice notes: explicit click-to-play, file/duration limits, moderation, accessible text alternative, removal controls; never autoplay.
- [ ] Add a country count to reign cards only after exposing a reliable distinct-country aggregate (exclude unknown regions). Do not infer country count from the top-regions list.
- [ ] Add a cryptographic-proof badge only once the exact placement proof is independently verified; distinguish pending anchoring from confirmed Bitcoin anchoring and link to verification.

## Publishing and physical archive ideas

- [ ] **Annual Wall Almanac:** explore a limited-edition hardcover at year-end or every 10,000 takeovers, provisionally titled "Take The Wall: Year One — The Complete Historical Archive." Include eligible public placements, reign duration, dates, public IDs, and verified timestamp proofs only where available. Define reproduction permission, moderation/removal handling, archive cutoff, print layout, and proof verification before publishing. Validate demand with a sample/PDF and preorders; estimate printing, shipping, tax, and fulfillment before setting a $50–$100 price. Do not promise every placement or a Bitcoin proof for every entry until supported.
- [ ] **Wall Gazette expansion:** the reviewed, fact-based newsroom is implemented. Later consider optional AI-assisted satire with bounded generation cost and source checking, downloadable newspaper images, an issue archive, and opt-in subscriber delivery. Social distribution depends on the controlled publishing integration. Do not repurpose existing transactional-email consent for Gazette emails.
- [ ] **Community hour expansion:** assess attendance before adding recurring schedules, calendar downloads, commemorative badges, livestream integration, promotional prices, or physical trophies. Any timed prize needs explicit server-side cutoff and payment rules before implementation.


## Deferred product changes — decide before building

- [ ] Fifteen-minute shield: validate demand first. Define immediate vs queued takeover behavior, server-enforced expiry, concurrent checkout handling, pricing/tax, and clear purchase terms. Confirm the effect on milestone ordering and replaceability before implementation.
- [ ] Physical billboard: begin with a small partner venue. Agree display rights, moderation, guaranteed exposure, outage/refund handling, costs, and permission for any webcam. Do not advertise locations or coverage before a working agreement and pilot.
- [ ] Auto-reclaim bundles: do not implement instant bidding loops. Reconsider only with explicit budgets, cooldowns, minimum exposure, cancellation, a credit ledger, and clear reward eligibility rules.
- [ ] Crowdfunded bounties: not planned for the initial product. Require a separate payment/payout, abuse, and legal review before any implementation; avoid targeting individuals.

## Measure before expanding

- [ ] Compare share-tool usage, referred visits, and completed purchases by source; exclude badge image fetches/crawlers from visitor and referral counts.
- [ ] Review results after sufficient real traffic rather than assuming conversion improvements. Keep controls and copy understandable before introducing additional game mechanics.
