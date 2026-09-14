# VisitorPing alert receiver

POST `https://www.takethewall.com/api/webhooks/visitorping?token=<private-token>`.
Use the canonical www hostname to avoid redirects. Register it under VisitorPing
Dashboard → Integrations → custom webhook. Select visitor arrival alerts;
`visitor.hot_lead` is supported too. Send the supplied JSON `event`/`data` envelope.
An `Authorization: Bearer <private-token>` header also works if supported.

The token is HMAC-SHA256(WALL_SERVER_SECRET, `visitorping:webhook:v1`). It is
separate from the existing server secret. No new environment variables are
required. Treat the complete URL as a credential; never commit it or expose it
through NEXT_PUBLIC configuration. Rotating WALL_SERVER_SECRET requires updating
the registered token. Deploy Convex before the Next.js app.

Validated alerts for takethewall.com are stored in `visitorPingWebhookDeliveries`
with server receipt time. City, region, country, source, entry page, device,
hot-lead flag, company and site name are retained. Optional missing strings become
empty strings. URL query strings/fragments and protected claim tokens are removed.
There is no public query for raw alerts. Inspect them in the Convex dashboard.
A bounded daily cleanup removes deliveries older than 90 days.

These are alert deliveries, not unique visitors. The payload has no event ID,
visitor ID, or occurrence timestamp. Identical bodies are retained because a retry
cannot reliably be distinguished from another arrival. Hot-lead alerts can overlap
arrivals. Alert deliveries do not increment visitor totals, referral scores, or
reward counts. Aggregate API polling and the existing globe remain unchanged;
this receiver stores city data but does not add city markers to the globe.

Responses: 200 only after persistence; 401 invalid token; 400 invalid payload,
event, or domain; 413 over 16 KiB; 415 non-JSON; 503 configuration/persistence
failure (including throttling), allowing provider retry. Limit: 600 accepted
alerts/minute. Retry behavior depends on VisitorPing.

Verification: `npx vitest run tests/visitorping-webhook-route.test.ts`, lint,
typecheck, build, then development backend push. Tests cover real mutation
storage, authentication, invalid input, persistence failures, repeated deliveries,
and retention. After registration, send a VisitorPing test event and verify a
200 plus a new database row. Do not infer unique visitors from delivery counts.

## Radar

The Radar toolbar panel subscribes to the newest 50 arrival deliveries. Its
public query returns only a delivery ID, receipt time, city and country. Region,
company, source and other webhook fields remain private. Hot-lead events are
excluded. Radar does not modify the all-time Globe or visitor totals.

Pins use an offline GeoNames city gazetteer. Ambiguous or missing cities fall
back to a labeled country center; unknown locations remain in the feed. Sound
starts off. Pause holds the displayed snapshot while incoming data continues
syncing; resuming does not replay arrival sounds. Initial history does not pulse.
Reduced motion disables arrival ring animation.
