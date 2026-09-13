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
