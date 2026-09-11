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

## Configuration observed during the initial check

- `STRIPE_WEBHOOK_SECRET` is empty, and Stripe lists no configured webhook endpoints. Signed delivery into the app and paid wall activation were therefore not tested end to end.
- `RESEND_FROM` is empty in `.env.local`. The verified sender above was used only for this explicit test.
- The local Convex deployment has neither `RESEND_API_KEY` nor `RESEND_FROM`. App transactional mail and admin OTP delivery run in Convex and will remain idle/unavailable until those deployment variables are configured.
- Existing reward/payout feature flags and persistent secrets were not changed.


## Follow-up after webhook registration

Both provider registrations are now enabled and both signing secrets are present locally. Stripe points to `/api/webhook` in **test mode** with the five required events plus `checkout.session.async_payment_failed` (currently acknowledged without a state transition). Resend points to `/api/webhooks/resend`; its registered `email.received` event is ignored, and `email.suppressed` can be added for suppression notifications.

Implemented the missing Resend receiver and deployed its audit-recording function to the local Convex backend. The production build on localhost:3002 passed:

- Stripe: locally signed replay of an actual provider `checkout.session.expired` event returned HTTP 200; modified payload returned 400.
- Resend: locally signed `email.delivered` fixture returned HTTP 200, duplicate returned 200, modified payload returned 400. These were local replays, not provider-originated HTTP deliveries.
- Automated checks: 95 tests, lint, TypeScript and production build pass. Regression tests include stale/missing/modified signatures, private-field projection, duplicate/out-of-order events and retryable persistence failure.

Public POST attempts to both registered URLs failed because this environment could not resolve `takethewall.com` (`ENOTFOUND`). Production provider-to-app delivery remains unverified until DNS, deployment and production environment variables are ready. No live-mode payment or real customer email was triggered by this follow-up.
