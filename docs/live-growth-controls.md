# Live wall growth controls

## Hall of Fame

Open `/admin`, select Growth, and toggle **Show Hall of Fame publicly**. It defaults to off and is independent of Wall History. Enabling it prepares existing records in batches; disabling it immediately hides the public section without deleting records.

The three categories are longest completed reign, most unique referral visitors, and most outbound clicks. Rankings use recorded counters, excluding demo additions and test purchases. Only active or replaced, unblocked production placements with a public ID and eligible purchase are included. Rankings do not grant additional prizes.

Scores update on activation/replacement, analytics flush, referral increments, moderation, and payment issues. Indexed leader queries avoid scanning all placements. The existing cleanup job can resume initial preparation; there is no new recurring polling job.

## Returning owners

Replacement emails include a protected retake shortcut and a separate report link. The shortcut authenticates the existing owner link and prepares an editable draft from the previous placement. The owner must review it and complete a new payment. Moderation emails retain only the report link.

## Live controls

Sound defaults to off. Visitors can save their preference locally; browser interaction is required to unlock audio. Initial page load and hidden tabs are silent. New takeovers use a brief visual notification with reduced-motion support.

On mobile, a purchase bar appears when the main purchase button is outside the viewport. It hides while a dialog is open or checkout is paused.

## Wallet verification

Checkout continues to use Stripe Embedded Checkout. Test payment-domain settings were inspected, but production wallet readiness was not verified because a live Stripe credential was unavailable. Confirm Apple Pay and Google Pay on the live domain with supported devices before describing them as verified.

## Crumbling Wall, Gazette, and community events

All controls live in `/admin` → Growth → Community features. New visibility controls and automatic Gazette drafting default to off.

The Crumbling Wall displays past production placements in the homepage's ordinary document flow. Load More expands the latest bounded window from 10 to at most 100 candidate records; the archive link continues beyond that. Both its own toggle and the main Wall History toggle must be enabled. Blocked, unpaid/test, and payment-issue records are excluded. The query refreshes a single window to avoid duplicates or gaps when a new owner arrives.

The Gazette is an editor-reviewed selection, not an exhaustive daily count or AI-generated news. Choose a completed UTC date to prepare a draft; repeat requests reuse the existing issue. Up to 12 eligible placements from the day's latest 100 activations are selected. A daily 00:05 UTC job can prepare the previous day's draft when explicitly enabled. Drafts never auto-publish. Review source links, edit the headline/story, and approve publication; saving as draft withdraws an issue. Only the latest published issue appears on the homepage when visibility is enabled. Current moderation/payment eligibility is rechecked for source cards. Review editorial text if it mentions content that is subsequently removed. Gazette messages are not sent to email or social platforms.

Community events are a single admin-scheduled UTC window, at most 24 hours long. The public banner counts down to the start and end, and disappears after the end or when disabled. Schedule another window for the next event. No price changes, winner selection, or physical prizes are introduced.

## Hacker terminal

Use the homepage Terminal button, Ctrl/Cmd+K, or `~` outside text inputs. The terminal is a modal with public live owner statistics and bounded command output. `help`, `status`, `stats`, `history`, `verify`, `clear`, and `exit` are supported.

`take --title "My SaaS" --url "https://example.com"` replaces the local draft and opens normal checkout for review. Omit `--url` for a personal message. An optional `--pay` token still only prepares checkout: it never charges a payment or bypasses validation. Commands are parsed, never evaluated. Private telemetry, visitor identifiers, and secrets are not displayed.
