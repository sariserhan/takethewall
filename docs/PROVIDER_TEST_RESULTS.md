# Stripe and Resend external checks

Tested 2026-09-11 using credentials from `.env.local`. No credentials are recorded here.

## Stripe — passed in test mode

- API authentication succeeds; balance reports `livemode: false`.
- The running app's `POST /api/checkout` creates a real Stripe test Checkout Session for a personal placement.
- Session amount is exactly 399 cents USD, one-time payment; takeover metadata and client reference agree.
- Repeating the same app request returns the same Checkout URL.
- The unpaid test Checkout Session was explicitly expired after inspection.
- A separate test PaymentIntent using Stripe's `pm_card_visa` succeeds for 399 cents. Its test refund succeeds for the full amount.
- Stripe's declined-card test PaymentMethod returns `card_declined`.

The successful PaymentIntent is a provider-level test, not a completed hosted Checkout or wall activation. No real money was charged. No paid takeover was activated.

## Resend — passed against the delivery simulator

- API authentication succeeds.
- `takethewall.com` is verified with sending enabled.
- A test message from `TakeTheWall <notifications@takethewall.com>` to `delivered@resend.dev` was accepted.
- Repeating its idempotency key returns the same email ID.
- Retrieving the email reports `last_event: delivered`.
- Email ID: `7d68e2aa-b733-467f-9f58-655aa5811406`.

This is Resend's delivery simulator, not proof of delivery to a human inbox. Reference: https://resend.com/docs/dashboard/emails/send-test-emails

## Configuration still needed for complete app flows

- `STRIPE_WEBHOOK_SECRET` is empty, and Stripe lists no configured webhook endpoints. Signed delivery into the app and paid wall activation were therefore not tested end to end.
- `RESEND_FROM` is empty in `.env.local`. The verified sender above was used only for this explicit test.
- The local Convex deployment has neither `RESEND_API_KEY` nor `RESEND_FROM`. App transactional mail and admin OTP delivery run in Convex and will remain idle/unavailable until those deployment variables are configured.
- Existing reward/payout feature flags and persistent secrets were not changed.
