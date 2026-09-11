# TakeTheWall.com — V1 Product & Engineering Specification

## 1. Product

TakeTheWall is a one-page internet advertising game.

Launch it as a playful internet experiment with transparent real numbers, not as a promise of advertising results. The takeover mechanic is a hypothesis for repeat visits; it does not guarantee an audience.

There is exactly **one current owner of the wall**.

Anyone can pay:

# **$2.99**

to immediately replace the current owner with their own website.

Ownership lasts until another successful $2.99 purchase replaces them.

There is:

* no account
* no login
* no signup
* required buyer email, without creating an account
* no subscription
* no auction
* no bidding
* no minimum ownership duration
* no maximum ownership duration
* no private analytics dashboard
* no user profile
* no admin-facing complexity beyond basic moderation/operations

Core rule:

> **The last successfully activated $2.99 purchase owns the wall.**

A buyer may own it for:

```text
1 second
10 minutes
3 days
100 days
```

The system makes no duration guarantee.

---

# 2. Brand

Domain:

```text
takethewall.com
```

Primary product name:

# Take The Wall

Primary tagline:

> **One wall. One owner. $2.99.**

Secondary copy:

> It could be yours for 1 second or 100 days.
> Someone else pays $2.99, they take it.

Primary CTA:

# **TAKE THE WALL — $2.99**

---

# 3. V1 Goal

Build the smallest possible production-ready version of TakeTheWall.

The entire consumer experience should exist on **one public page**.

A new visitor should understand the complete product in under 5 seconds.

V1 succeeds when:

1. A visitor opens `takethewall.com`.
2. They see the current wall owner.
3. They see current public traffic/advertising analytics.
4. They submit a website URL, logo, description, and buyer email.
5. They pay $2.99 through Stripe.
6. Payment is confirmed server-side.
7. They immediately become the wall owner.
8. Every browser currently viewing TakeTheWall updates in real time.
9. Analytics for the new ownership period begin from zero.
10. The owner remains until another successful buyer replaces them.

---

# 4. Technology Stack

Use:

```text
Next.js App Router
TypeScript
Tailwind CSS
shadcn/ui where useful
Convex
Convex Storage
Stripe hosted Checkout
VisitorPing
Vercel
```

Do not introduce unnecessary infrastructure.

Do NOT use:

```text
PostgreSQL
Redis
Kafka
Temporal
Kubernetes
separate Express backend
Firebase
Supabase
custom authentication
```

V1 requires no authentication.

---

# 5. Architecture

```text
Browser
   │
   ▼
Next.js
   │
   ├── Convex realtime queries
   │
   ├── Takeover submission
   │
   └── Stripe Checkout creation
            │
            ▼
         Stripe
            │
       payment success
            │
            ▼
       Stripe webhook
            │
            ▼
        Convex mutation
            │
      activate takeover
            │
            ▼
     realtime wall update
            │
            ▼
      every open browser
```

Visitor analytics:

```text
Visitor
   │
   ▼
TakeTheWall
   │
   ├── VisitorPing event
   │
   └── Convex lightweight counters
            │
            ▼
       Current takeover
```

Use Convex as the real-time source of truth for public counters.

Use VisitorPing for richer underlying analytics/tracking.

Do not make TakeTheWall dependent on VisitorPing being available for basic operation.

---

# 6. Public Page

There is one primary public page:

```text
/
```

Do not build:

```text
/dashboard
/account
/login
/signup
/stats
/history
/profile
/pricing
```

Invisible server/API endpoints are allowed.

Legal information may be presented in lightweight modals/footer links rather than turning the site into a multi-page SaaS.

---

# 7. Page Structure

The page should be extremely simple.

Recommended structure:

```text
TAKE THE WALL

12,481 VISITORS TODAY
1,847,291 TOTAL VISITORS
3,821 TOTAL TAKEOVERS


THIS WALL CURRENTLY BELONGS TO

             [ LOGO ]

            VisitorPing

Know who's on your website right now.

        VISIT WEBSITE →


CURRENT REIGN
02:14:38

8,921 IMPRESSIONS
481 CLICKS
5.39% CTR

TOP REGIONS

US       47%
UK       12%
Canada    8%
Germany   6%
Other    27%


────────────────────────────

$2.99

TAKE THE WALL

It could be yours for 1 second
or 100 days.

Someone else pays $2.99,
they take it.

────────────────────────────

Live analytics powered by VisitorPing
```

No navbar.

No sidebar.

No complex footer.

No SaaS-style feature sections.

The current wall is the product.

---

# 8. Current Owner Display

The current owner controls only:

```text
logo
website URL
description
```

Display:

```text
[LOGO]

Website/domain name

Description

VISIT WEBSITE →
```

The entire owner advertisement area should be clickable.

Also include an obvious:

```text
VISIT WEBSITE →
```

CTA.

Both should open the owner's destination.

Prefer opening in a new tab.

---

# 9. Buyer Input

Before payment, collect exactly:

## Website URL

Required.

Example:

```text
https://visitorping.com
```

Rules:

* HTTPS only
* valid public URL
* no localhost
* no private IP addresses
* no `javascript:`
* no `data:`
* no unsupported schemes

---

## Logo

Required.

Allow:

```text
PNG
JPEG
WEBP
```

Potentially SVG later, but preferably exclude it from V1 to reduce security complexity.

Recommended limits:

```text
max file size: 2 MB
```

Upload into Convex Storage.

Never hotlink the buyer's logo directly.

---

## Description

Required.

Plain text only.

Maximum:

```text
120 characters
```

No HTML.

No Markdown rendering.

No JavaScript.

## Buyer email

Required before payment. This is the fourth and final required field.

Purpose: purchase receipts, activation confirmation, replacement notices, and necessary payment/support messages. Collecting an email must not create an account, password, login, or public profile.

* Validate format and length server-side; trim whitespace without rewriting address semantics.
* Prefill Stripe Checkout with this email so buyers do not enter it twice. Store the final Checkout receipt email separately if it differs.
* Store emails in a private purchase/contact record, separate from public takeover data.
* Never return emails through public Convex queries, include them in VisitorPing events, or place them in URLs or client logs.
* Explain the transactional email purpose beside the field. Purchase is not consent to marketing; V1 has no marketing enrollment.
* Use Stripe for the payment receipt. Send activation and replacement messages through a server-side email service with idempotent delivery jobs.
* A message must describe the recorded event accurately: “Your takeover was activated” rather than promise ownership is still current at delivery time.
* Email failures must not block or roll back a paid takeover. Retry transient failures and expose delivery failures to operations.
* Rate-limit submissions and email delivery. Send takeover messages only for confirmed purchases; do not send email for abandoned or unpaid submissions.
* Document contact-data retention and deletion in the privacy notice; preserve payment records only as required for payment operations and applicable obligations.

---

# 10. Display Name

Do not require another field.

Derive a reasonable display name from the website/domain.

Example:

```text
https://visitorping.com
→ VisitorPing / visitorping.com
```

If reliable automated prettification is difficult, simply display:

```text
visitorping.com
```

Keep V1 simple.

---

# 11. Checkout

Use:

# Stripe-hosted Checkout

Payment type:

```text
one-time payment
```

Amount:

```text
$2.99 USD
```

Price should be fixed in V1.

No coupons.

No subscription.

No quantity selection.

No dynamic bidding.

Enable supported accelerated payment methods such as:

```text
Apple Pay
Google Pay
Link
cards
```

when available through Stripe Checkout.

---

# 12. Purchase Flow

User completes:

```text
URL
Logo
Description
Buyer email
```

Then presses:

```text
TAKE THE WALL — $2.99
```

Flow:

```text
Validate fields
       ↓
Upload/store logo
       ↓
Create pending takeover in Convex
       ↓
Create Stripe Checkout Session
       ↓
Attach takeover ID to Stripe metadata
       ↓
Redirect to Stripe Checkout
       ↓
User pays
       ↓
Stripe confirms successful payment
       ↓
Webhook received
       ↓
Verify Stripe signature
       ↓
Verify payment amount/currency/status
       ↓
Idempotent Convex activation mutation
       ↓
New takeover becomes ACTIVE
       ↓
Previous takeover becomes REPLACED
       ↓
All connected browsers update
```

---

# 13. Return From Stripe

After Checkout, return to `/` with an opaque purchase-status token scoped to that purchase. Do not create `/success`.

Create the token server-side before Checkout, store only its hash, and expire it after a limited confirmation window. Its status endpoint exposes only the purchase's confirmation state and public takeover details, never email or payment identifiers. Do not use a guessable takeover ID as authorization to read private purchase information.

Return-state behavior:

* Awaiting verified activation: **“Confirming your takeover…”**
* Confirmed and still active: **“The wall is yours. For now.”**
* Activated but already replaced: **“Your takeover went live. Someone else has already taken the wall.”** Show its recorded duration.
* Delayed confirmation: explain that confirmation is pending and do not encourage another payment. Allow a status retry.
* Cancelled Checkout: preserve the form for retry without showing success.

Capture and remove the token from the URL before loading third-party analytics. Prevent referrer leakage and never include it in VisitorPing metadata.

The redirect, query parameters, and browser return order are not proof of payment. Only the verified Stripe webhook can activate ownership. Confirmation must refer to this purchase, not merely any currently active takeover.

---

# 14. Ownership Semantics

An ownership period is called a:

```text
takeover
```

A paid takeover becomes active only after successful server-side payment confirmation. Initial house placement and explicit moderation restoration are separately recorded exceptions; neither is a paid purchase.

At any moment:

```text
exactly 1 takeover = ACTIVE
```

Previous takeover becomes:

```text
REPLACED
```

Ownership starts at:

```text
activatedAt
```

Ownership ends at:

```text
replacedAt
```

Duration:

```text
replacedAt - activatedAt
```

For the active owner:

```text
now - activatedAt
```

---

# 15. Concurrency

Multiple people may be checking out simultaneously.

The ownership transition must be serialized by Convex.

Do NOT trust:

```text
browser return order
client timestamps
browser clocks
```

The authoritative rule is:

> Successful payments are activated server-side. Each confirmed activation receives a monotonic activation sequence. The takeover with the highest confirmed activation sequence is the owner.

Use an atomic Convex mutation.

Example:

```text
activationSequence: 10482
```

Then:

```text
10482 replaces 10481
```

This prevents race-condition corruption.

Every Stripe event must be idempotent.

Processing the same webhook multiple times must never create multiple takeovers or increment ownership multiple times.

---

# 16. No Duration Guarantee

The purchase guarantees:

> Ownership beginning when the successful takeover is activated.

It does NOT guarantee:

```text
minimum duration
minimum impressions
minimum clicks
minimum traffic
minimum geographic distribution
minimum conversion
```

Examples:

```text
Alice buys.

3 seconds later Bob buys.

Alice received exactly 3 seconds.
```

Valid transaction.

No automatic refund.

---

# 17. Refund Rule

V1 refund policy:

No refund because:

```text
ownership was short
traffic was low
clicks were low
someone immediately replaced buyer
buyer changed their mind
```

Refund may be appropriate only when:

```text
duplicate charge
payment succeeded but takeover was never activated due to system failure
fraud/payment processor requirement
```

Validate content before checkout whenever possible.

---

# 18. Initial Owner

Seed the first wall owner manually:

```text
VisitorPing
```

VisitorPing remains the owner until the first customer successfully takes the wall.

After that:

> Never automatically restore VisitorPing during normal purchase operation. Only an explicit moderation action may use the house ad as described in Section 38.

Ownership must always follow the last successful takeover.

---

# 19. Public Site Analytics

Show three site-wide counters:

```text
VISITORS TODAY
TOTAL VISITORS
TOTAL TAKEOVERS
```

These are public.

Example:

```text
12,481 TODAY
1,847,291 ALL TIME
3,821 TAKEOVERS
```

### Site-wide visitor definitions

* **Visitors today:** distinct first-party browser identifiers observed during the current UTC day. Label the UTC boundary in a tooltip or equivalent small explanation.
* **Total visitors:** distinct first-party browser identifiers observed across the site's lifetime, not a sum of daily counts.
* **Total takeovers:** successfully activated paid purchases only; exclude the initial house ad and moderation restorations.

These are estimates of visitors based on browser identifiers, not verified people. Clearing storage or using another browser can create another identifier. Explain this briefly beside the metrics or in an information tooltip.

Maintain separate site-wide and daily deduplication records in addition to per-takeover deduplication. Exclude known bots and tagged development/test traffic from all public advertising counters. Bot filtering is best effort; never claim every counted visit is a proven human.

---

# 20. Current Reign Analytics

Publicly display analytics for the **current owner only**:

```text
CURRENT REIGN DURATION
IMPRESSIONS
UNIQUE VISITORS
CLICKS
CTR
TOP REGIONS
```

No private analytics page.

No authentication required.

Everyone sees the same current-owner analytics.

---

# 21. Analytics Reset

Every takeover begins with:

```text
impressions = 0
uniqueVisitors = 0
clicks = 0
regions = {}
```

Analytics are attributed using:

```text
takeoverId
```

Therefore:

```text
Takeover A
12:00–12:10
```

has separate analytics from:

```text
Takeover B
12:10 onward
```

even when both advertise the same website.

---

# 22. Impression Definition

Definition:

> An eligible impression occurs when the current owner advertisement is visibly displayed in a foreground browser tab, either on initial load/reload or after a live ownership change.

Store:

```text
takeoverId
timestamp
visitorId
region
```

Do not count known bots/crawlers in the public advertising analytics where reliable bot classification is available.

Count at most once per page instance and displayed takeover. Reloading creates a new page instance; counter updates, React rerenders, reconnects, and duplicate event delivery do not create more impressions. A hidden tab records the new owner's impression only when that advertisement becomes visible.

Bind events to the takeover actually displayed, never whichever takeover happens to be current when an asynchronous event arrives. Use bounded event acceptance windows and server-issued context to prevent arbitrary historical attribution. Late accepted events may finalize the original reign's counters but must never be credited to its replacement.

---

# 23. Unique Visitor Definition

Generate/use a first-party visitor identifier.

For each takeover:

```text
same visitor ID = 1 unique visitor
```

Example:

```text
Visitor reloads 5 times.

Impressions:      5
Unique visitors:  1
```

Do not require authentication.

---

# 24. Click Definition

A click occurs when a user activates the current owner's ad/website CTA.

Track:

```text
takeoverId
visitorId
timestamp
destination
region if available
```

Then navigate to the destination.

Do not delay navigation waiting for analytics.

Use send-beacon/background event techniques where appropriate.

Use a stable event ID per click activation to deduplicate transport retries and overlapping card/button handlers. Separate intentional clicks may count separately, so CTR can exceed 100%; do not clamp or silently redefine the formula. Apply abuse limits consistently.

---

# 25. CTR

Use standard calculation:

```text
CTR = clicks / impressions × 100
```

If:

```text
impressions = 0
```

show:

```text
0%
```

---

# 26. Regions

Show top geographic regions.

Prefer:

```text
country
```

rather than precise city-level public analytics.

Example:

```text
United States     47%
United Kingdom    12%
Canada             8%
Germany            6%
Other             27%
```

For compact UI, country codes/flags are acceptable.

Aggregate remaining regions into:

```text
Other
```

---

# 27. VisitorPing Integration

TakeTheWall should double as a public demonstration of VisitorPing.

Track TakeTheWall with VisitorPing.

Important events:

```text
wall_impression
wall_owner_link_click
take_wall_clicked
checkout_started
checkout_completed
takeover_activated
```

Event metadata should include:

```text
takeoverId
ownerDomain
destination
```

Where applicable.

Display somewhere subtle:

> **Live analytics powered by VisitorPing**

Link it to:

```text
https://visitorping.com
```

Do not make VisitorPing branding visually compete with the wall owner.

Browser interactions may emit the first four events. Emit `checkout_completed` and `takeover_activated` only from verified server-side processing through a supported VisitorPing ingestion path; a success redirect must never emit authoritative payment success. Deduplicate retries using stable event IDs.

Use the actual VisitorPing tracker/site-key and supported event ingestion contract during implementation. Do not invent an API or expose private credentials to make the suggested environment-variable names fit. Persist a retryable delivery job if server-side analytics delivery fails; payment activation remains independent.

Never include buyer emails, payment identifiers, purchase-status tokens, or URL credentials in event metadata. Normalize destinations and strip sensitive query parameters and fragments before analytics delivery.

---

# 28. Analytics Reliability

Maintain lightweight operational counters in Convex.

Do not calculate the public homepage purely by calling VisitorPing APIs on every request.

Architecture:

```text
page event
   ├── Convex aggregation
   └── VisitorPing event
```

Therefore:

```text
VisitorPing temporarily unavailable
→ TakeTheWall still works
```

---

# 29. Realtime

Use Convex realtime subscriptions.

The following should update live without refreshing:

```text
current owner
logo
description
destination
current takeover ID
takeover start time
impressions
clicks
unique visitor count
regions
total takeover count
```

If another user takes the wall while someone is watching:

```text
old owner disappears
new owner appears
new counters begin
```

automatically.

---

# 30. Timer

Do not write to the database every second.

Store:

```text
activatedAt
```

Client calculates:

```text
Date.now() - activatedAt
```

Update the visible timer locally every second.

Example:

```text
02:17:41
```

---

# 31. Suggested Convex Schema

## takeovers

```ts
takeovers: {
  websiteUrl: string,
  domain: string,
  description: string,

  logoStorageId: Id<"_storage">,

  kind: "paid" | "initial_house" | "moderation_restoration",
  sourceTakeoverId?: Id<"takeovers">,
  endReason?: "purchase" | "moderation",

  status:
    | "pending"
    | "active"
    | "replaced"
    | "rejected",

  stripeCheckoutSessionId?: string,
  stripePaymentIntentId?: string,

  // Required for paid takeovers; omitted for house/moderation reigns.
  amountCents?: number,
  currency?: string,

  createdAt: number,
  paidAt?: number,
  activatedAt?: number,
  replacedAt?: number,

  activationSequence?: number,

  impressions: number,
  uniqueVisitors: number,
  clicks: number,
}
```

Indexes should support:

```text
status
activationSequence
stripeCheckoutSessionId
stripePaymentIntentId
```

---

## takeoverRegions

Recommended separate aggregation table:

```ts
takeoverRegions: {
  takeoverId: Id<"takeovers">,
  regionCode: string,
  impressions: number,
  uniqueVisitors: number,
}
```

---

## takeoverVisitors

Used for unique visitor deduplication:

```ts
takeoverVisitors: {
  takeoverId: Id<"takeovers">,
  visitorHash: string,
  firstSeenAt: number,
}
```

Create a compound index on:

```text
takeoverId + visitorHash
```

Do not store more identifying information than necessary for this purpose.

---

## siteStats

Maintain singleton/global state:

```ts
siteStats: {
  totalVisitors: number,
  totalTakeovers: number,

  currentTakeoverId: Id<"takeovers">,

  currentActivationSequence: number,

  updatedAt: number,
}
```

Daily visitor counts can be stored separately or calculated from daily aggregate records.

---

## dailyStats

```ts
dailyStats: {
  date: string,

  visitors: number,
  impressions: number,
  clicks: number,
  takeovers: number,
}
```

Use UTC consistently internally.

Display dates/times based on the browser where relevant.

### Required supporting records

The schema above is illustrative, not exhaustive. Include:

* Private purchase/contact records: buyer email, final receipt email, Checkout/payment references, takeover association, and hashed expiring confirmation token.
* Processed payment-event records and uniqueness checks on the Checkout Session and PaymentIntent. Different Stripe event IDs for the same purchase must not activate it twice.
* Site visitor and daily visitor deduplication records, indexed by visitor hash and UTC date as appropriate.
* Expiring analytics event receipts for replay deduplication and short-lived rate-limit records.
* Pending upload records with cleanup deadlines for abandoned submissions.
* Idempotent email/analytics delivery jobs with retry state.
* Append-only moderation transitions recording the removed reign, restored creative, reason, server timestamp, and operator action reference.

Public queries must explicitly select public fields rather than return entire documents containing private purchase data. Use internal/server-authorized functions for payments, moderation, delivery jobs, and privileged counter updates.

---

# 32. Stripe Metadata

Checkout Session metadata should include:

```text
takeoverId
```

Potentially also:

```text
environment
```

Example:

```json
{
  "takeoverId": "abc123",
  "environment": "production"
}
```

Do not trust buyer-supplied pricing metadata.

Server determines:

```text
amount = 299 cents
currency = USD
```

---

# 33. Stripe Webhook

Verify Stripe signature before processing.

Relevant event should confirm successful one-time payment.

Processing:

```text
receive event
      ↓
verify signature
      ↓
check event not previously processed
      ↓
retrieve takeover ID
      ↓
verify amount = 299
      ↓
verify currency = usd
      ↓
verify payment successful
      ↓
atomically activate takeover
      ↓
record Stripe identifiers
      ↓
emit takeover_activated analytics event
```

Store processed Stripe event IDs for idempotency if necessary.

---

# 34. Security

Never expose:

```text
Stripe secret key
Stripe webhook secret
Convex server secrets
VisitorPing private credentials
```

to browser code.

Validate URLs server-side.

Never render buyer HTML.

Never render buyer JavaScript.

Never render buyer CSS.

Never embed buyer pages in iframes.

### Account-free abuse controls

Rate-limit upload authorization, pending submissions, Checkout creation, status lookup, and event ingestion server-side. Enforce image limits after upload as well as before it. Bound storage consumption and delete abandoned, unreferenced uploads after a documented grace period; never delete assets referenced by historical takeovers.

Use idempotency keys for submission/Checkout retries. Deduplicate analytics event IDs, apply plausibility limits, and derive country from trusted server/platform metadata rather than trusting a browser-supplied country. Do not expose an unrestricted public mutation that accepts arbitrary counter increments.

Identify development/test traffic explicitly and keep Stripe test-mode data separate from production counters. These controls reduce manipulation; they cannot certify that every anonymous browser is a unique real person.

---

# 35. Destination Security

Before creating Checkout:

1. Parse URL.
2. Require HTTPS.
3. Reject localhost.
4. Reject loopback addresses.
5. Reject RFC1918/private-network destinations.
6. Reject malformed URLs.
7. Reject dangerous protocols.
8. Normalize domain.
9. Optionally perform lightweight malicious-domain checks.

Do not automatically fetch arbitrary internal URLs from the backend.

Protect against SSRF.

---

# 36. Logo Security

Upload logo directly through controlled upload flow.

Validate:

```text
MIME type
file extension
file size
actual image decode where practical
```

Recommended:

```text
PNG
JPEG
WEBP
<= 2 MB
```

Normalize images if useful.

Do not execute/render arbitrary SVG in V1.

---

# 37. Description Security

Description:

```text
plain text
<= 120 characters
```

Escape output normally through React.

No:

```text
dangerouslySetInnerHTML
```

---

# 38. Content Policy

Reject obvious:

```text
phishing
malware
fraud
impersonation
illegal goods/services
explicit pornography
extremist/terrorist promotion
sites designed to steal credentials
```

V1 does not require an elaborate moderation platform.

Build a simple admin action to:

```text
disable current takeover
```

if necessary.

If a current owner must be removed for policy/security reasons, restore the creative from the most recent valid prior takeover or a safe house ad such as VisitorPing, as a new moderation reign.

This is an exceptional moderation action, not normal ownership behavior.

### Moderation is a recorded transition

A removal ends the current reign and records why it ended. Restore the most recent eligible prior creative as a **new house/moderation reign**, or use the safe VisitorPing house creative if none remains eligible. Never reopen or overwrite a historical paid reign.

The restored reign starts fresh counters and timestamps, retains a reference to the source creative/reign, and is explicitly marked as a moderation restoration rather than a paid purchase. Increment the global activation sequence for serialization, but do not increment paid takeover totals or invent a Stripe payment. Preserve all original paid-reign timestamps and analytics.

The next successfully activated paid purchase replaces this moderation reign normally. Exactly one active reign remains the invariant, with normal paid activation and exceptional moderation activation distinguished in the data model.

---

# 39. Admin

No consumer accounts.

A minimal private admin capability may exist using deployment/admin credentials.

Admin should be able to:

```text
view current takeover
view payment identifiers
disable malicious takeover
inspect recent takeovers
manually refund through Stripe workflow if required
```

Do NOT build a large admin dashboard.

A protected internal page or Convex admin tooling is sufficient.

---

# 40. Previous Owner

Keep this extremely small.

Optionally show:

```text
Previous owner:
example.com · 13m 42s
```

No full public history in V1.

No leaderboard.

No `/history`.

These can be added later if they improve virality.

---

# 41. Initial Metrics

Before real traffic exists, do not fabricate numbers.

Display actual counters.

Examples:

```text
0 visitors today
14 total visitors
0 takeovers
```

Seed takeover count only if there has actually been a takeover.

The original VisitorPing house placement is not a paid takeover and does not increase the total takeover counter.

---

# 42. Performance

The page should feel instant.

Targets:

```text
fast initial load
minimal JavaScript beyond realtime needs
optimized logo
no analytics-blocking rendering
no polling loops
```

Use Next.js metadata and server rendering where useful.

Use Convex client subscriptions for realtime state.

---

# 43. SEO / Social Sharing

Set strong metadata:

```text
Title:
Take The Wall — One Wall. One Owner. $2.99.

Description:
Pay $2.99 and take over the only ad on the page.
Keep it until somebody else pays $2.99.
```

Open Graph image should clearly communicate:

```text
TAKE THE WALL
$2.99
LAST PAYER OWNS IT
```

The project depends on being shareable.

---

# 44. Mobile

Mobile is first-class.

The entire purchase flow must work extremely well on iPhone and Android.

Especially optimize:

```text
Apple Pay
Google Pay
logo upload
CTA size
current-owner ad
analytics readability
```

The page should not feel like a desktop dashboard squeezed onto mobile.

---

# 45. Design Direction

Visual design should be:

```text
bold
minimal
slightly absurd
high contrast
fast
internet-native
```

Avoid generic SaaS styling.

Do not build:

```text
gradient-heavy SaaS hero
feature cards
testimonial section
enterprise navigation
pricing table
```

The entire product is already interesting enough.

### Agreed visual direction

Use an oversized typographic poster: off-white background, black text, one vivid accent, a large owner logo, and compact live counters. The current owner occupies the main visual space. Keep the takeover CTA visible on mobile without obscuring the ad or numbers.

Use a restrained transition when ownership changes and respect reduced-motion preferences. Include a live preview in the purchase sheet so buyers can inspect their ad before payment. Keep VisitorPing attribution subtle and permanent.

---

# 46. Main CTA

The primary CTA must always be immediately available:

# TAKE THE WALL — $2.99

Click opens an inline modal/sheet containing:

```text
Website URL
Logo
Description
Buyer email

[ PAY $2.99 & TAKE THE WALL ]
```

Do not navigate away to another TakeTheWall route before Stripe.

---

# 47. Submission UX

Recommended flow:

```text
TAKE THE WALL
      ↓
modal opens
      ↓
URL
Logo
Description
Buyer email
      ↓
preview
      ↓
PAY $2.99 & TAKE THE WALL
      ↓
Stripe
```

Include a simple live preview of the owner advertisement before payment.

Do not overbuild onboarding.

---

# 48. Button State

While creating Checkout:

```text
Preparing checkout...
```

Disable double submission.

On error:

```text
Couldn't start checkout. Try again.
```

Do not create multiple pending takeovers from repeated button presses if avoidable.

---

# 49. Takeover Activation UX

When ownership changes live, animate subtly.

Example:

```text
OLD OWNER
fade out

NEW OWNER
fade in
```

Optional small label:

```text
THE WALL WAS JUST TAKEN
```

Do not use heavy animation.

---

# 50. Tracking Ownership Changes

Every takeover should permanently retain historical analytics internally even though only current-owner analytics are shown publicly.

Store final:

```text
duration
impressions
unique visitors
clicks
CTR
regions
activatedAt
replacedAt
```

This will allow future features without rebuilding historical data.

---

# 51. Potential Future Features — NOT V1

Do not build yet:

```text
leaderboards
history page
longest reign
most takeovers
most clicks
owner accounts
social profiles
bidding
dynamic prices
subscriptions
multiple walls
categories
NFTs
crypto
comments
likes
chat
referral system
affiliate payouts
custom themes
video ads
HTML ads
```

Only add features after real usage demonstrates demand.

---

# 52. Possible Future Viral Metrics

Preserve data so these can eventually exist:

```text
longest reign ever
shortest reign ever
most impressions from one takeover
most clicks from one takeover
most frequent owner
most times dethroned
fastest revenge takeover
```

Do not display these in V1.

---

# 53. V1 Acceptance Criteria

V1 is finished when all of the following work:

### Homepage

* current owner loads correctly
* logo renders correctly
* description renders correctly
* owner website opens correctly
* daily visitors display
* total visitors display
* total takeovers display
* current reign timer works
* impressions display
* unique visitors display
* clicks display
* CTR displays
* top regions display

### Takeover

* modal opens
* URL validates
* logo uploads
* description validates
* pending takeover created
* Stripe Checkout created
* $2.99 charged
* webhook validated
* takeover activates exactly once
* previous owner becomes replaced
* all active browsers update automatically

### Analytics

* impression tied to correct takeover
* unique visitor tied to correct takeover
* click tied to correct takeover
* regions tied to correct takeover
* new takeover starts counters from zero
* site-wide counters remain cumulative

### Failure Cases

* duplicate Stripe webhook does not duplicate takeover
* failed payment does not change owner
* abandoned checkout does not change owner
* malformed URL rejected
* invalid image rejected
* malicious protocol rejected
* concurrent purchases do not corrupt ownership state

### Quality

Run:

```text
lint
typecheck
tests
production build
```

All must pass.

### Additional acceptance criteria

* Required buyer email validates, prefills Checkout, and stays absent from every public query and analytics payload.
* Receipts and activation/replacement notifications use the intended purchase contact, deduplicate retries, and do not block activation on delivery failure.
* Returning before the webhook shows pending confirmation; returning after replacement describes that completed reign accurately.
* Repeated renders/reconnects do not count impressions; a visible live owner change counts once for the new reign.
* Site lifetime, daily UTC, and takeover unique counts deduplicate independently.
* Known bots and tagged development/test events do not increase public metrics.
* Submission, upload, and ingestion abuse limits are enforced on the server.
* Moderation creates a new recorded reign while preserving the previous reign's history and paid takeover count.
* VisitorPing unavailability does not block payment, wall updates, or public counter collection.

---

# 54. Automated Tests

At minimum create tests for:

```text
URL validation
description length
file validation
checkout creation
Stripe webhook signature handling
Stripe webhook idempotency
takeover activation
activation sequence increment
previous-owner replacement
impression increment
unique visitor deduplication
click increment
CTR calculation
region aggregation
daily visitor aggregation
concurrent takeover mutations
```

Also cover:

```text
buyer email validation and private/public data separation
Checkout email prefill and final receipt email handling
pending, active, replaced, and cancelled return states
expired/invalid purchase-status tokens
cross-event idempotency for the same payment
live-change visibility and impression deduplication
site-lifetime and daily UTC unique deduplication
click handler and transport retry deduplication
known bot and development traffic exclusion
upload/submission/event rate limits and cleanup
transactional notification retries and deduplication
VisitorPing delivery failure isolation
moderation restoration without historical overwrite
```

---

# 55. Development Rules for Coding Agent

Implement the entire V1.

Do not stop after scaffolding.

Do not leave core TODO placeholders.

Work in logical units.

For every unit:

```text
implement
test
lint
typecheck
fix
commit
continue
```

Use small Git commits.

Examples:

```text
feat: scaffold Next.js and Convex
feat: add takeover schema
feat: add logo upload
feat: integrate Stripe Checkout
feat: activate takeovers from webhook
feat: add realtime wall state
feat: track impressions and visitors
feat: track owner link clicks
feat: add region analytics
feat: build takeover modal
feat: add VisitorPing instrumentation
test: cover payment and takeover races
```

Maintain:

```text
IMPLEMENTATION_STATUS.md
```

with:

```text
Completed
In Progress
Remaining
Known Issues
Decisions
```

---

# 56. Environment Variables

Expected configuration approximately:

```text
NEXT_PUBLIC_CONVEX_URL=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=

NEXT_PUBLIC_SITE_URL=https://takethewall.com

VISITORPING_SITE_ID=
VISITORPING_API_KEY=
```

Use actual VisitorPing integration requirements.

Never expose secret values through `NEXT_PUBLIC_`.

Also configure the chosen transactional email provider's server-only credentials and verified sender. Prefer an existing suitable service, with separate TakeTheWall templates and delivery records. Keep email credentials private and configure Stripe receipt delivery. Do not assume another project's sender/domain is verified for this project.

---

# 57. Deployment

Production:

```text
takethewall.com
```

Hosting:

```text
Vercel
```

Backend:

```text
Convex production deployment
```

Payment:

```text
Stripe live mode
```

Before enabling live payments:

1. Test Stripe test mode.
2. Test concurrent checkouts.
3. Test duplicate webhook delivery.
4. Test failed payments.
5. Test abandoned Checkout.
6. Verify HTTPS.
7. Verify production webhook.
8. Verify domain.
9. Verify Apple Pay / wallet availability.
10. Verify analytics attribution.

---

# 58. Product Invariant

This invariant must always remain true:

> **There is one wall and one current owner.**

And:

> **The newest successfully activated $2.99 takeover replaces the previous owner immediately.**

Do not introduce functionality that weakens this simplicity.

---

# 59. Product Philosophy

TakeTheWall should not feel like an advertising platform.

It should feel like a strange piece of the internet that happens to provide advertising.

The value proposition is:

```text
$2.99
+
uncertain ownership duration
+
only advertisement on the page
+
public live traffic results
+
instant takeover
```

The unpredictability is part of the product.

Do not attempt to make ownership fair.

Do not guarantee exposure.

Do not introduce time slots.

Do not introduce bidding.

Do not protect someone simply because they purchased recently.

The rule is deliberately simple:

# **Pay $2.99. Take the wall. Keep it until someone else does.**
