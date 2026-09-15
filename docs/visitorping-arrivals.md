# VisitorPing arrival ingestion

`visitor.arrival` on the authenticated webhook now contributes a homepage session
when no matching browser impression is known. The payload's `data.sessionId`
and `data.visitorId` must be the same database IDs forwarded as
`providerSessionId` / `providerVisitorId` on `wall.impression`. Do not mix the
SDK's anonymous IDs with these database IDs.

- Arrival retries use a stable session key. Different people in one city stay separate.
- An unmatched arrival updates total views, daily views, city counts, and reign regions.
  It does not manufacture a unique browser or a live-presence heartbeat.
- A later signed impression removes the provisional arrival and keeps the actual
  browser impression. Counts can briefly include both while that callback is pending.
- A signed excluded impression removes its provisional arrival and referral.
- Only a tracked `ref=ttw_...` link credits referrals. Provider visitor IDs deduplicate
  referral credit; the signed browser referral identity replaces that identity once known.
- All human/likely-human page views are forwarded by the worker independently of
  notification policy. Notification and page-view arrivals share a session key.
- Legacy browser alerts without IDs remain stored; merging them with Vercel cannot
  be done reliably from city/time. Legacy `Visitorping Admin` messages have no
  browser counterpart and use a deterministic payload key, including timestamp
  when supplied. Identical legacy payloads without timestamps cannot be distinguished.
- No recurring API fetch is used. `visitorPingWebhook:replay` accepts up to 50 stored
  delivery IDs for explicit one-time replay. Snapshot-era alerts should not be replayed
  indiscriminately because earlier imports may already represent their traffic.

Deploy the receiver before the updated VisitorPing consumer. The shared formatter
also adds stable timestamp-based IDs to dashboard-sent messages lacking session IDs;
that improvement requires deploying VisitorPing's web app. The receiver supports
old admin messages during this rollout.
