# Take The Wall — Growth roadmap

## Implemented

- [x] Ownership badge endpoint with live/past-owner states; copyable Markdown and HTML in the published share dialog, owner dashboard, and public placement page. Public links only; no owner credentials. Short cache lifetime; external image caches may delay updates.
- [x] Completed-reign cards in landscape, square, and portrait: dark styling, recorded duration, unique visitors, outbound clicks, and a QR link. Existing live placement cards remain available. Cards reflect recorded counters at export, not an immutable analytics snapshot.
- [x] Existing admin social post kit offers reviewed captions and downloadable images. Existing Hall of Fame has an independent admin visibility toggle, defaults off, and excludes demo additions/test purchases.

- [x] Crumbling Wall: admin-controlled homepage posters for past production placements, bounded Load More, and respect for the main history visibility switch.
- [x] Hacker terminal: keyboard shortcut and mobile button, public live stats, a small command set, and prefilled checkout requiring normal review/payment.
- [x] Community hour: admin-configured UTC schedule, public countdown, title, description, and visibility control. Normal prices and reward rules remain in effect.
- [x] Gazette newsroom: fact-based draft generation for completed UTC days, optional automatic drafts at 00:05 UTC, editable headline/story, source links, revision checks, explicit publication/withdrawal, and public visibility control.

- [x] Micro-AMA: owner opt-in, private bounded inbox, answered questions shown live, reporting through the existing placement-report flow, request limits, and automatic closure on replacement/moderation.
- [x] Celebration templates: editable birthday, proposal, new-arrival, and launch-day messages inside personal-placement checkout.
- [x] Printable placement certificate: public record, UTC activation, recorded visitor count, completed duration, and browser Print / Save as PDF. No unverified blockchain or real-world-event certification.
- [x] Pop-out companion: native Document Picture-in-Picture where available, ordinary window fallback, public live placement view, and no duplicate wall-impression events.

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

## Further interactive-wall ideas

- [ ] **Playable wall:** pilot a small first-party game template with owner branding (Snake/Pong) and mobile/keyboard support. Measure outbound clicks separately from play time. Uploaded games require isolated hosting, a restrictive sandbox, asset limits, review, and explicit network permissions before acceptance.
- [ ] **Live-data ads:** start with a validated public GitHub repository and server-cached star counts. Show source and last-update time; handle rate limits and outages. Add crowdfunding feeds only through supported providers; do not accept arbitrary API URLs or credentials. Defer market tickers pending a clear use case and data-provider terms.
- [ ] **Cursed takeover campaign:** use existing moderated images/messages; no special payment mechanic required. Do not manufacture audience reactions or make payment the way to report/remove prohibited material.
- [ ] **WebOS template:** optional fixed desktop with readme, gallery, and reviewed product links. A demo icon opens web content; it must not execute uploaded binaries or scripts. Consider arbitrary apps only after isolation/review infrastructure exists.
- [ ] **AI announcer:** separate opt-in from the chime, short moderated scripts, approved synthetic voices, pronunciation handling, cost limits, and replay/deduplication controls. Keep audio off by default.
- [ ] **Wall Passport:** start with cosmetic browser-local stamps. Clearly distinguish these from verified achievements. Free credits require server-side identities, witnessed-event verification, abuse controls, and a credit ledger; do not infer owner nationality from visitor location.
- [x] **Keep or Yeet:** audience feedback with live counts, one changeable browser vote per takeover, and request limits. Votes do not change prices, ownership, reward eligibility, or analytics.
- [ ] **Dynasties and crests:** verified opt-in account association, cumulative measured reign time, and a small accessible accent palette. Never merge owners by public name or expose buyer emails. Assess repeat usage before adding paid status incentives.
- [ ] **Architectural projection:** a future venue-backed pilot with owner/building permission, practical equipment tests, operating arrangements, content review, budget, and a clear exposure/outage policy before advertising physical placement.
- [ ] **AMA follow-ups:** question retention/cleanup policy, dedicated admin question moderation, and notifications only if owners explicitly request them. Current polling refreshes the private inbox every 15 seconds while the page is visible; public answers are reactive.
- [ ] **Certificate upgrades:** downloadable PDF generation, optional verified timestamp-proof links, and print fulfillment after demand is established. The current version uses the browser's vector-text Print / Save as PDF workflow.
- [ ] **Companion upgrades:** dedicated optional chime, takeover animation, and broader device testing. Ordinary pop-out windows cannot promise always-on-top placement.

## Wall experiments

- [x] **Try Mine:** private inline title/website preview, handed into the normal reviewed paid checkout; no invented spectator counts or reservation.
- [x] **Hold:** mouse, touch, and keyboard challenge with a browser-local personal best and cosmetic 30-second Steady Hand badge. No global leaderboard or prize.
- [x] **Pulse:** on-demand server HEAD check of the current published website, public-IP pinning, verified HTTPS connection, bounded requests, one-minute result reuse, and explicit inconclusive outcomes. No invented hosting-provider or edge-location claims.
- [x] **Magnet:** always-enabled mouse-driven spring motion on the masthead letters with reduced-motion support.
- [x] **Rave:** optional smooth neon background and live-indicator pulse, separately enabled synthesized beat, reduced-motion support, and no audio while the tab is hidden or the wall is frozen.
- [ ] **Radar / Sonar:** investigate VisitorPing support for genuine realtime arrival events and appropriately coarse locations before building live pings. Current 30-minute aggregate polling cannot supply city-level arrivals or visitor latency. Define retention, event limits, accessibility, and opt-in sound; never generate pretend live visitors or latency figures.
- [ ] **Hold leaderboard:** only consider shared records after implementing server-verified timing, identity and anti-abuse rules. The browser-local badge is cosmetic.

## Creative experiments

- [x] **Atmosphere:** manual clear/rain/snow/fog, explicitly not real weather. Optional local visuals with reduced-motion support.
- [x] **Decade Warp:** Present / 1984 / 1996 / 2077 selector replaces Retro. Checkout stays readable; no flashing text.
- [x] **Thermal:** clearly labeled personal cursor/touch/keyboard trail; no shared tracking or network collection.
- [x] **Morse:** public owner message translated to visible Morse and explicit Play/Stop audio; unsupported characters omitted, bounded length, stops when hidden or closed.
- [x] **Blacklight:** persistent site-wide flashlight theme with a dark violet veil, pointer/touch and keyboard-focus tracking, visible exit and Escape shortcut. No separate dialog.
- [x] **Theremin:** separate play surface, explicit sound start/stop, pointer/touch/keyboard control, no ad-link clicks.
- [x] **Origami Brick:** six-face printable SVG net with seven glue tabs, takeover artwork/number, live-homepage QR, A4/Letter print document and browser Save as PDF. Geometry and digital print output verified; physical assembly still needs a real paper trial.
- [x] Group visual/audio toys under **Experiments**; keep core utility buttons and Try Mine directly accessible.
- [ ] **Live Weather Sync:** optional owner-selected city, owner consent, weather provider, cached observations and source/update time. Do not infer owner location from audience countries. Manual Atmosphere is available now.
- [ ] **Shared Thermal:** only after opt-in coarse cursor collection, throttled/batched updates, short retention, abuse/cost limits, and exclusion of forms/checkout/private pages. Never fabricate live spectators.
- [ ] **Owner Blacklight messages:** opt-in moderated public messages and removal handling; never reveal hidden records or private credentials.
- [ ] **Paper brick production polish:** physically test cut/fold fit with A4 and Letter printers before promoting it as an assembly-tested product; consider direct downloadable PDF generation later.
