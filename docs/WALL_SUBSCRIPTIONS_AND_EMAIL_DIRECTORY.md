# Wall subscriptions and email directory

## Visitor experience

The homepage “Notify me when the wall changes” dialog offers every takeover or a daily summary at 09:00 UTC. Double opt-in is required. It is separate from milestone alerts and owner digests; checkout and support contacts are not automatically subscribed. Existing confirmed subscriptions cannot be changed by someone resubmitting their email address.

Confirmed subscribers start with future activations, without replaying earlier takeovers. A production-only cron processes bounded subscriber batches each minute. Every-takeover subscriptions catch up in batches of 20; daily summaries include up to the latest 20 eligible takeovers and send nothing on unchanged days. Mail includes the branded responsive template, takeover content, a public share-card image, and a link to the live wall.

Preferences and unsubscribe links use separate scoped tokens. Provider one-click unsubscribe uses POST, while browser links show a preferences page and require an explicit button action. Unsubscribing or changing frequency invalidates unsent messages from the previous subscription generation. The queue checks consent and removed content again before sending. An already submitted provider request cannot be recalled.

The owner dashboard already supports share-card preview and downloads in landscape, square, and portrait formats. All three downloads are now also available on the public takeover page.

## Admin experience

Open `/admin` → **emails**. The directory deduplicates addresses case-insensitively and shows collection sources, wall/milestone subscription status, and the latest recorded email. Search matches the start of the email address. The **View emails** dialog shows message type, subject, queue/send timestamps, and Resend delivery events. It never returns message bodies, OTPs, or owner-access links.

- **pending / sending / failed** describe application delivery attempts.
- **accepted** means the Resend send API accepted the message.
- **skipped** means no email was sent, for example after unsubscribe.
- **historical processed** preserves the ambiguity of older outbox rows, where `sent` could also mean skipped. Do not interpret this as proven delivery.
- Provider events such as **delivered**, **bounced**, **complained**, and **delivery delayed** appear with their occurrence timestamps. Delivered does not establish inbox placement.

Webhook events are stored independently of the send record and joined by Resend email ID, so an early webhook is not lost. Events are deduplicated by webhook event ID. The existing signed Resend webhook endpoint is reused; no new webhook URL is required.

Existing purchase/receipt contacts, subscribers, reward claimants, support contacts, and outboxes are reconciled in resumable batches every five minutes. New transactional recipients and sign-in sends appear immediately. Older messages whose provider IDs were never saved cannot automatically be matched to delivery events. The directory is for operational visibility, not permission to broadcast to all collected addresses.

## Deployment

Deploy both the Next.js application and Convex functions. No new environment variables are required; the existing `CLAIM_TOKEN_SECRET`, `SITE_URL`, server bridge secret, Resend API key, and signed webhook configuration are reused. Broadcasts require `WALL_ENVIRONMENT=production`; tests use mocked providers and do not send subscriber emails.

## Suppression and contact controls

The existing signed Resend webhook now retains the bounce classification, without recipient lists, diagnostics, or message content. A `Permanent` bounce or `email.complained` event pauses wall updates, milestone alerts, their confirmation messages, and weekly owner digests. Transient/temporary/unknown bounces and delivery delays do not trigger this policy. Successful or out-of-order delivery events never clear it. A webhook arriving before the send record is matched when the provider ID is saved later. The bounded directory reconciliation also checks previously recorded delivery events. Older bounces without a stored classification are not assumed to be permanent.

Suppression is checked when preparing queued mail and before sending owner jobs, as well as when subscribing/confirming or queuing updates. Changing a preference or resubmitting a signup cannot bypass the stop. Purchase, support, and sign-in messages are not treated as optional marketing updates. Already submitted provider requests cannot be recalled.

In `/admin` → **emails** → **View emails**, contact preferences show the suppression reason/date and wall/milestone confirmation timestamps. Previously confirmed subscribers without a stored date show “Date not recorded”; dates are never inferred from collection or delivery time. **Unsubscribe optional emails** applies the same stop to an address. No control silently resubscribes a suppressed contact.

**Delete contact email data** requires typing the address. It immediately removes the directory entry and blocks queued messages to that contact. A bounded, resumable erasure clears subscriber records, email history, matching purchase email fields, related support correspondence, and reward-claim email/access-token fields. It revokes the affected owner access links, clears associated admin email snapshots, and redacts the address from operational audit metadata. Other email addresses on a purchase are preserved. An internal retry cron resumes interrupted batches; the dialog shows pending/completed status.

This is application contact-data deletion, not deletion of public wall history, payment records, reward eligibility records/documents, or Better Auth administrator accounts. Copies held by Stripe, Resend, or recipient mailboxes are outside this control. The confirmation screen states these boundaries. A retained email hash and deletion marker prevent reconciliation and late delivery callbacks from restoring the address or its email history. It is intentionally not a provider-side unsubscribe/deletion API call.

Validation covers unauthorized mutations, explicit deletion confirmation, early and repeated webhooks, hard versus soft bounces, re-subscription attempts, stale queued messages, historical consent dates, more than one deletion batch, preservation of unrelated contacts and financial records, and post-deletion reconciliation.

Provider references: [Resend bounce webhook](https://resend.com/docs/webhooks/emails/bounced), [bounce classifications](https://resend.com/docs/dashboard/emails/email-bounces).
