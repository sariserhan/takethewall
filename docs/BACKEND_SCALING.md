# Backend scheduling and analytics

## Analytics

Accepted events retain the existing receipt and unique-browser checks. They accumulate in 16 independently keyed buckets per takeover and UTC day. The first event in a bucket schedules its flush for 10–14.5 seconds later. The flush adds the deltas to existing totals and deletes the bucket in the same transaction; replaying a completed flush is a no-op. No backfill or reset of existing totals is needed.

Ownership, payment activation, and takeover numbering remain synchronous. Public analytics are eventually consistent, normally within 15 seconds, rather than triggering shared-document writes on every impression. A 15-minute recovery scan catches buckets whose scheduled flush did not complete. This is not a guarantee of production throughput: staging load tests and production OCC metrics are still needed to quantify capacity.

Replacement email snapshots and frozen reward statistics now wait 150 seconds after replacement, covering the 120-second accepted late-event window plus normal batching delay. Finalization also checks for pending batches for that takeover. If any remain, it schedules their flush and retries finalization after 30 seconds. That delay does not consume an email delivery attempt. The indexed batch read and snapshot write share a transaction, so a competing flush cannot produce a partially updated frozen snapshot.

## Email delivery

Both existing stores (`jobs` and `transactionalMail`) use a shared scheduled delivery entry point. Queue producers schedule work immediately; failures schedule the existing retry policy. A shared clock spaces delivery starts 1.25 seconds apart. A future retry is scheduled to join the ready queue at its due time, so it does not reserve the queue ahead of immediately ready mail.

Individual messages run in independent actions, permitting overlapping provider I/O without one long sequential batch action. Existing templates, consent checks, sender snapshots, retry limits, provider idempotency keys, delivery history, and recovery records are retained. The two storage schemas remain as compatibility adapters; they are not destructively migrated. A 15-minute recovery job handles legacy pending records and interrupted actions. Old dispatcher function names remain available for previously scheduled references.

## Maintenance

- New ownership triggers wall subscriber work, milestone alerts, and reward maintenance.
- Reward creation and deadline changes schedule reminder/deadline checks; chat replies schedule their delayed notification check.
- Subscriber processing continues in bounded batches until current work is drained.
- Cleanup runs every five minutes, with a separate midnight UTC rollover.
- Delivery, reward, subscriber, audit, deletion, and analytics recovery checks run every 15 minutes.
- Contact backfills and email-directory reconciliation run hourly; contact indexing schedules the next batch while unfinished.
- Daily and weekly email schedules retain their documented UTC times.

## Public queries and admin responses

Homepage milestone queries request summaries. Detailed claimant history loads separately for an active milestone or its permanent page. The public browser Convex client is reused across navigation, while server rendering does not reuse a cross-request client.

Admin overview, list, claim, and ticket queries return validated objects rather than serialized JSON. Authorization and the existing safe field projections remain in place. Frontend and backend must be released together for this response-type change.

## Verification

Existing payment, reward, authorization, subscriber, and email tests remain in place. Additional in-memory tests cover buffered bursts, flush replay, UTC rollover, scheduled mail delivery, duplicate execution, and future-message pacing. No test sends real mail or charges a card. Regression coverage additionally delays analytics beyond the normal finalization window, verifies that neither email reports nor reward snapshots freeze early, and verifies stable email payloads on provider retry.

The refactor was pushed successfully to development deployment `aromatic-falcon-454`. Production has not been deployed.
