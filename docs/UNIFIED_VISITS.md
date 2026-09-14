# Unified visits

The wall and VisitorPing now report the same signed wall impression to a shared ledger. The view key is `impression:<takeoverId>:<pageId>`; the signed browser hash supplies the unique-visitor identity. Retries and the second source enrich that record rather than adding another view. Different browser identities are never merged by city or time.

## Flow

1. `/api/context` signs the browser/page/takeover identity and Vercel country/city.
2. The browser sends that token to `/api/events` and attaches `wallContext` and `wallEventId` to its existing VisitorPing `wall_impression` custom event.
3. VisitorPing's consumer forwards human/likely-human wall impressions to the organization's existing wall webhook URL. It forwards the raw shared fields without retaining the token in event analytics. Notification preferences and cooldowns do not gate this callback.
4. The receiver verifies the existing webhook credential and signed context, then invokes the same analytics mutation with VisitorPing's location.
5. The first accepted view changes counts. The second changes only source/location metadata. VisitorPing geography wins when known; Vercel provides the fallback. Corrections move the existing regional impression instead of adding one.
6. Radar uses one record per signed browser per UTC day, returning only opaque record ID, first-seen time, city, and country. Its list is capped at the 50 most recently seen browsers. Top regions retains current-reign impression percentages. Those two scopes remain different by design.

## Delivery and retention

The webhook accepts signed-context delivery up to 24 hours after its normal expiry. Views retain the original signed context's UTC day and takeover. Transient callback failures retry the VisitorPing queue; the ledger makes those retries idempotent. Ordinary browser contexts retain the original five-minute expiry. Ledger and Radar records are retained for seven days, beyond the callback retry acceptance window. Existing aggregate history remains intact.

Legacy notification records have no shared identity and do not populate the new Radar. No attempt is made to infer past identity from city or timestamps. Existing visitors enter Radar when they next produce a verified view; their existing visitor counts are not incremented again.

Both delivery paths still require the initial signed `/api/context` response. This improves delivery coverage if one subsequent tracking path fails; it cannot recover views when both trackers, or that initial context request, are blocked. The impression remains the wall's visible-content measurement, not every possible page load.

## Rollout

Development is `aromatic-falcon-454`; production is `canny-bee-832`.

Deploy Take The Wall's Convex backend and Next.js receiver/frontend first, then deploy the VisitorPing consumer changes in `apps/consumer/src/wall-visit-callback.ts` and `index.ts`. No new environment variable is needed: the callback uses the organization's existing `customWebhookUrl`, whose target must be the HTTPS `/api/webhooks/visitorping` endpoint on takethewall.com or www.takethewall.com. The existing URL authentication token and wall signing secret stay server-side.

Do not deploy the producer first: older receivers do not accept the `wall.impression` event. No production deployment or historical backfill is performed as part of development verification.

## Tracked referral fallback

Arrival alerts preserve only a syntactically valid `ref=ttw_…` public ID before redacting the rest of the landing URL. A source label or a referral ID alone does not grant credit: old alerts lack the shared verification identity and cannot be safely backfilled.

The existing referral `begin` request prepares a random 256-bit delivery token. Convex stores only its SHA-256 hash with the signed-cookie browser identity, public referral ID, creation/expiry times, and (when present) the owner credential hash used for self-referral checks. These identities and credential hashes never enter the referral tracker payload. The preparation can fail without disabling the direct referral path.

After five continuous visible seconds, the client emits `wall_referral_visit` containing only the random token and public referral ID, alongside the ordinary completion request. VisitorPing forwards human/likely-human events as authenticated `wall.referral` callbacks with their event timestamp. The receiver hashes the token; Convex requires the matching public ID, an event timestamp 5–120 seconds after preparation, and delivery within 24 hours. Both paths call the same referral implementation, including repeat-browser, environment, blocked-takeover and identifiable self-referral exclusions. Multiple tokens for one browser still produce one referral per takeover. Expired preparation records are removed in bounded scheduled batches.

Referral credit is recorded at acceptance time, never backdated into a closed reward cohort. The callback can recover the visit counter; it cannot set the browser's purchase-attribution cookie if direct completion failed. Both paths require successful initial referral verification setup. This is not a mechanism to convert arbitrary referrer traffic into prize credit.

Deploy the wall backend and receiver before the VisitorPing consumer. This implementation is verified in development; production rollout remains separate.
