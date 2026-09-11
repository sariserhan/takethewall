# TakeTheWall implementation delta — consolidated specification

Status: implementation authorized. This document supersedes conflicting wording in `sped-addition.md` and the Admin, Winner Chat & Public Pages addendum. Original V1 remains the baseline. The authoritative decisions below are preserved verbatim.

## Repository mapping

| Existing implementation | Extension |
| --- | --- |
| `convex/purchases.ts`, `siteStats` | Keep atomic activation/idempotency; add paid-only numbering, canonical public audit record, milestone dispatch |
| `convex/schema.ts`, `convex/model.ts` | Add optional fields for migration, typed content, rewards/claims, sessions, conversations, tickets, audit/checkpoints |
| `lib/stripe.ts`, checkout/webhook routes | Central 399-cent constant, provider facade, refund/dispute reward handling |
| `components/purchase-sheet.tsx`, `components/wall.tsx` | Content selector, personal walls, adaptive CTA, public numbering/progress/overlay |
| `convex/jobs.ts`, `lib/delivery.ts` | Preserve existing event/email pipeline; extend reliable transactional delivery for claims/support |
| `convex/analytics.ts` | Preserve durable counters and existing 120-second late-event allowance |
| `convex/visitorping.ts` | Keep private API reports; no analytics on admin or claim routes |
| `convex/operations.ts` | Keep internal moderation; add authenticated admin interface with independent authorization |
| `components/legal.tsx` | Dedicated public legal pages and linked disclosures |
| `vercel.json`, `DEPLOYMENT.md` | Preserve Vercel + Cloudflare DNS-only deployment; document new provider settings |

## Additional required legal pages

Create `/terms`, `/privacy`, `/disclaimer`, `/disclosure`, with page-specific metadata and footer links. `/rewards` remains the authoritative versioned reward rules; disclosure summarizes and links to those rules rather than creating competing eligibility rules.

- Terms: 399-cent fixed purchase, all supported public content, successful activation ordering, no reserved sequence/guaranteed duration or results, content license and moderation, refunds/payment disputes, permanent trophy scope, rewards subject to rules, support and mandatory rights.
- Privacy: public/private data distinction, Stripe/Convex/Vercel/VisitorPing/Resend/admin auth, browser identifiers, account-free purchases, claim authentication, private chat/documents, purposes, retention/deletion and contact. No claims that hashed identifiers are necessarily anonymous; no private-route analytics.
- Disclaimer: no promised traffic, earnings, placement duration, verified-person metrics, eligibility, or payout before confirmation; external links are third-party content; audit hashing has limited guarantees.
- Disclosure: paid public placements, house/restoration placements, 399-cent price, provisional rewards/cascade/manual payout, fees/tax responsibility subject to rules, immutable content and later statistics freeze, feature availability, links to full rules/terms/privacy.
- Legal copy must match implemented behavior. Do not invent an operator legal entity/address, governing jurisdiction, eligibility countries, minimum legal ages or tax thresholds. Missing operator/legal details are documented as launch configuration/review requirements, not an engineering blocker. Version legal documents and record accepted versions with purchases and claims.

## Reconciliation decisions

Use the existing two-minute late-event allowance, not the fallback 15 minutes. Keep paid number separate from moderation activation sequence. New claims freeze the configured deadline durations/rules; future settings do not rewrite existing claims. Reward/payout/promotion flags default off; existing obligations continue to be visible and auditable. No arbitrary document uploads: documents are accepted only against explicit admin requests. Start with manual eligibility review behind a provider interface. A claim-link resend rotates the token; delayed notification emails link to a safe reauthentication entry rather than persisting raw tokens. Plain hash-chain verification requires independently retained checkpoints to detect complete historical rewriting.

## Authoritative requirements

Yes — consolidate the existing milestone/reward/admin addenda into **one implementation-ready delta spec against the current repository**, then proceed with implementation.

Do NOT regenerate or rebuild the original V1. Inspect the existing codebase first and extend what already works.

The following decisions are authoritative.

## 1. Takeover price

Change the fixed takeover price to:

```ts
TAKEOVER_PRICE_CENTS = 399;
```

Public CTA:

```text
TAKE THE WALL — $3.99
```

The server is authoritative for price.

---

## 2. A takeover may promote anything, not only a website

Do NOT require purchasers to own a website.

Before checkout, ask:

```text
WHAT DO YOU WANT TO PUT ON THE WALL?

[ Website ]
[ App ]
[ Social ]
[ Me / Message ]
```

Internally, prefer one generic linked-content model plus a personal-content model.

Recommended:

```ts
type WallContent =
  | {
      type: "link";
      linkType:
        | "website"
        | "ios_app"
        | "android_app"
        | "instagram"
        | "tiktok"
        | "youtube"
        | "x"
        | "linkedin"
        | "other";

      destinationUrl: string;
      displayName: string;
      imageStorageId?: Id<"_storage">;
      description?: string;
    }
  | {
      type: "personal";
      displayName: string;
      imageStorageId?: Id<"_storage">;
      message?: string;
    };
```

### Website

Collect:

```text
Website URL
Logo
Description
```

### App

Collect:

```text
App Store / Google Play URL
App icon
Description
```

Detect/link type when possible.

Examples:

```text
apps.apple.com → ios_app
play.google.com → android_app
```

### Social

Support at minimum:

```text
Instagram
TikTok
YouTube
X
LinkedIn
Other
```

Collect:

```text
Profile/channel URL
Image/avatar
Short description
```

### Personal

Collect:

```text
Display name
Optional avatar/image
Optional message
```

No URL required.

Example:

```text
SERHAN WAS HERE

"I owned the wall for 17 seconds."
```

Defaults:

```ts
DISPLAY_NAME_MAX_CHARS = 60;
DESCRIPTION_MAX_CHARS = 120;
PERSONAL_MESSAGE_MAX_CHARS = 120;
PUBLIC_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
```

Allowed public image types:

```text
PNG
JPEG
WEBP
```

No SVG in V1.

---

## 3. CTA adapts to content type

Examples:

```text
website     → VISIT WEBSITE
ios_app     → VIEW ON APP STORE
android_app → GET THE APP
instagram   → VIEW INSTAGRAM
tiktok      → VIEW TIKTOK
youtube     → VIEW CHANNEL
x           → VIEW ON X
linkedin    → VIEW LINKEDIN
personal    → no outbound CTA
```

The entire linked wall area may remain clickable in addition to the explicit CTA.

---

## 4. Takeover numbering

Every successfully activated paid takeover gets exactly one permanent sequential number:

```text
#1
#2
#3
...
#100
#1000
```

Important:

```text
Checkout creation DOES NOT reserve a number.
```

Numbers are assigned only during authoritative successful payment activation in an atomic Convex mutation.

Example:

```text
Alice opens Checkout
Bob opens Checkout

Bob activates first   → #100
Alice activates later → #101
```

Do not use client timestamps to determine ordering.

The seeded VisitorPing wall is:

```text
takeoverNumber = null
```

and does not count.

The first real paid takeover is:

```text
#1
```

---

## 5. Payment-provider abstraction

Do not block engineering on Stripe policy review.

Use the current Stripe implementation, but wrap it behind an abstraction:

```ts
interface PaymentProvider {
  createCheckout(...): Promise<...>;
  verifyWebhook(...): Promise<...>;
  getPayment(...): Promise<...>;
  refundPayment(...): Promise<...>;
}
```

Do not unnecessarily rewrite working Stripe code.

Prize payouts are NOT done through Stripe.

---

## 6. Milestone configuration

Initial milestones:

```ts
[
  { takeoverNumber: 100, rewardUsd: 100 },
  { takeoverNumber: 1_000, rewardUsd: 1_000 },
  { takeoverNumber: 10_000, rewardUsd: 10_000 },
  { takeoverNumber: 100_000, rewardUsd: 100_000 },
  { takeoverNumber: 1_000_000, rewardUsd: 1_000_000 },
];
```

All milestone behavior must be configuration-driven.

---

## 7. All milestone routes exist from launch

These must resolve immediately:

```text
/100
/1000
/10000
/100000
/1000000
```

Use a reusable milestone-page template.

Each route has three states:

```text
FUTURE
→ VERIFYING
→ FINALIZED
```

Do NOT 404 unreached milestone routes.

---

## 8. Future milestone page

Before the milestone is reached, the route is a real teaser/marketing page.

Example `/10000`:

```text
🏆 THE $10,000 WALL

MILESTONE #10,000

NO OWNER YET

CURRENT PROGRESS
8,471 / 10,000

1,529 TAKEOVERS TO GO

PRIZE
$10,000

THE VERIFIED WINNER RECEIVES

✓ $10,000 milestone reward
✓ Permanent ownership of /10000
✓ Permanent wall placement
✓ Permanent image/logo + description/message
✓ Original takeover statistics
✓ Permanent place in TakeTheWall history

[ FIGHT FOR THE LIVE WALL — $3.99 ]

The live wall may last 1 second or 100 days.
This one lasts forever.
```

Each milestone page must have custom SEO/Open Graph metadata.

Examples:

```text
/100
The $100 Wall | TakeTheWall

/1000
The $1,000 Wall | TakeTheWall

/1000000
The $1,000,000 Wall | TakeTheWall
```

These routes should be shareable long before they are won.

---

## 9. Provisional milestone recipient

When takeover #N equals a configured milestone, that purchaser becomes the first:

```text
PROVISIONAL MILESTONE RECIPIENT
```

Do not immediately make them final winner.

Example:

```text
#1000
→ provisional recipient of $1,000
```

---

## 10. Cascade rule

If the provisional recipient cannot receive the reward:

```text
#1000 → ineligible
#1001 → expired
#1002 → approved
```

then:

```text
#1002 receives the reward.
```

Rules:

* no random redraw
* no manual replacement choice
* no arbitrary skipping
* continue sequentially
* no maximum cascade distance

If the required next takeover does not exist yet:

```text
status = awaiting_successor
```

When that takeover occurs, automatically create its claim.

A takeover may legitimately receive multiple rewards if cascades overlap.

---

## 11. Worldwide wording

Do NOT state that every person in every jurisdiction is guaranteed eligibility.

Use:

> TakeTheWall is available globally. Milestone rewards are available wherever participation, verification, and payout are permitted by applicable law and our payment and payout providers.

If a candidate cannot legally/technically receive payment, mark them ineligible and cascade.

---

## 12. Claim deadline

Initial claim submission:

```ts
INITIAL_CLAIM_DEADLINE_DAYS = 7;
```

Internal admin review time does NOT count against the winner.

If additional information is requested:

```ts
ADDITIONAL_INFORMATION_DEADLINE_DAYS = 7;
```

Admin may extend a claimant deadline, but must record:

```text
reason
admin ID
old deadline
new deadline
timestamp
```

and create an audit event.

---

## 13. Winner authentication

Use this flow:

```text
claim link emailed
↓
winner opens link
↓
fresh OTP sent to purchase email
↓
winner enters OTP
↓
authenticated claim session created
```

Do NOT email the reusable link and reusable code together.

Claim token:

```ts
CLAIM_TOKEN_BYTES = 32; // 256 bits
```

Route:

```text
/reward/claim/[token]
```

Store only the token hash.

OTP:

```ts
OTP_LENGTH = 6;
OTP_EXPIRATION_MINUTES = 10;
OTP_MAX_ATTEMPTS = 5;
```

OTP requirements:

```text
single use
hashed at rest
rate limited
short-lived
```

Claim session:

```ts
CLAIM_SESSION_HOURS = 12;
CLAIM_SESSION_MAX_HOURS = 24;
```

On claim-link resend:

```text
invalidate old token
generate new token
send new link
```

---

## 14. Winner portal

The protected claim page should become a complete winner portal containing:

```text
reward amount
milestone
takeover number
claim status
claim deadline
claim checklist
required information
document requests if required
payout status
claim history
private admin chat
```

No TakeTheWall account is required.

---

## 15. Eligibility information

Start with:

```text
Country of residence
Legal name
Date of birth / age
```

Then load additional requirements dynamically:

```ts
getClaimRequirements({
  country,
  region,
  prizeUsd
})
```

Possible requirements may include:

```text
address
phone
government ID
tax information
tax forms
residency declaration
payout details
eligibility declarations
rules acceptance
```

Do not collect information unless required.

V1 may use protected operator review.

Architect KYC/identity verification behind a provider interface for future use.

---

## 16. Private claim documents

Do not reuse public ad/logo storage.

If private document upload is required:

```ts
PRIVATE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
MAX_PRIVATE_DOCUMENTS_PER_CLAIM = 10;
```

Allow initially:

```text
PDF
PNG
JPEG
WEBP
```

Requirements:

```text
private access only
no public URLs
winner + authorized admin only
never sent to VisitorPing
never indexed
audited access
retention metadata
deletable
```

Default retention after finalization:

```ts
PRIVATE_DOCUMENT_RETENTION_DAYS_AFTER_FINALIZATION = 90;
```

unless applicable retention requirements override it.

---

## 17. Manual reward payout

Prize payout is performed externally by bank/wire transfer.

Do NOT implement Stripe Connect or automatic prize disbursement.

States:

```text
pending
sent
confirmed
```

Store:

```text
amount
currency
method = manual_wire
admin-entered reference
sentAt
confirmedAt
adminId
```

Default reward currency:

```text
USD
```

A reward becomes fully finalized only after payout is confirmed.

---

## 18. Permanent milestone winner

Once:

```text
eligibility approved
+
payout confirmed
```

publish/finalize the permanent milestone winner.

Milestone pages must support either:

### Linked winner

```text
[IMAGE]

VisitorPing

Description

VISIT WEBSITE
```

or:

```text
[APP ICON]

My App

Description

VIEW ON APP STORE
```

or:

```text
[PROFILE IMAGE]

Creator Name

Description

VIEW TIKTOK
```

### Personal winner

```text
[AVATAR]

SERHAN S.

"I took TakeTheWall #1,000."
```

No CTA if no URL exists.

---

## 19. Trophy statistics

At payout confirmation, freeze the winner identity/content snapshot.

If the winning takeover still owns `/`:

```text
ORIGINAL REIGN
Still active

analytics = LIVE
```

When eventually replaced, wait for the existing late-event allowance.

If none exists:

```ts
ANALYTICS_LATE_EVENT_WINDOW_MINUTES = 15;
```

Then freeze permanently:

```text
reign duration
impressions
unique visitors
clicks
CTR
regions if retained
```

Future takeovers by the same website/person must never modify that milestone trophy.

---

## 20. Verification milestone page

While unresolved, `/1000`, `/10000`, etc. should show:

```text
🏆 THE $1,000 WALL

MILESTONE REACHED

Winner verification in progress

PROVISIONAL RECIPIENT
Takeover #1000
visitorping.com
```

Also show the public takeover sequence around the current candidate.

---

## 21. Milestone verification overlay

While any milestone remains unresolved, show a realtime public overlay on `/`.

Desktop:

```text
fixed non-blocking right-side panel
~360px max width
dismissible
```

Mobile:

```text
small fixed milestone pill
tap → bottom sheet
```

Show:

```ts
MILESTONE_SEQUENCE_RADIUS = 3;
```

Meaning:

```text
3 before
candidate
3 after
```

Example:

```text
$1,000 MILESTONE
Verification in progress

#997   acme.com
#998   John R.
#999   startup.ai

#1000  visitorping.com ← PROVISIONAL

#1001  Sarah K.
#1002  nextsite.com
#1003  waiting
```

Rows support both linked and personal wall owners.

If cascade occurs:

```text
#1000  INELIGIBLE
#1001  PROVISIONAL ←
```

If candidate moves outside the current range, recenter automatically.

Only expose public-safe information.

Never expose:

```text
email
legal name unless already public display name
country
address
claim details
payment ID
private rejection reason
```

Overlay disappears after payout confirmation.

Optional brief final state:

```text
🏆 $1,000 MILESTONE FINALIZED
Takeover #1002
VIEW PERMANENT WALL →
```

Dismissal persists only for that milestone/browser.

---

## 22. Homepage permanent-wall section

Show configured milestone walls:

```text
PERMANENT WALLS

🏆 #100
The $100 Wall
Winner finalized

🏆 #1,000
The $1,000 Wall
Verification in progress

🔒 #10,000
The $10,000 Wall
1,529 to go

🔒 #100,000
The $100,000 Wall

🔒 #1,000,000
The $1,000,000 Wall
```

Each links to its route.

---

## 23. Reward rules page

Implement:

```text
/rewards
```

Include:

```text
milestone schedule
reward amounts
takeover numbering
provisional winner concept
cascade behavior
deadlines
eligibility
worldwide wording
sanctions/provider restrictions
tax/payout responsibility
chargeback/refund implications
manual payout process
permanent trophy behavior
audit/hash-chain explanation
```

Rules must be versioned and hashed.

Once a milestone is reached, its:

```text
rulesVersion
rulesHash
reward amount
milestone definition
```

become immutable.

---

## 24. Cryptographic audit chain

Each activated takeover gets:

```text
publicTakeoverId
previousAuditHash
auditHash
```

Use deterministic canonical JSON and:

```text
SHA-256
```

Include at minimum:

```text
takeoverNumber
publicTakeoverId
activatedAt
amountCents
currency
public wall-content identifier
previousAuditHash
```

The atomic Convex sequence determines ordering.

The hash chain only makes later history modification detectable.

Do not describe hashing as independently proving payment-order fairness.

---

## 25. Audit checkpoints

Checkpoint:

```text
every 100 successful takeovers
OR
every 24 hours
```

whichever occurs first.

Support OpenTimestamps/external anchoring asynchronously.

Do not block takeover activation on external timestamping.

---

## 26. Admin dashboard

Implement:

```text
/admin
/admin/takeovers
/admin/milestones
/admin/claims
/admin/messages
/admin/support
/admin/audit
/admin/settings
```

Normal public purchasers still require NO account.

Use existing auth if available.

If none exists, prefer Clerk.

Admin authorization requires:

```text
authenticated identity
+
server-side allowlist
```

All admin Convex functions must enforce admin authorization server-side.

---

## 27. Admin capabilities

Admin needs:

```text
takeover inspection
content moderation
milestone inspection
claim review
winner communication
request additional information
approve claim
mark ineligible
extend deadline
record wire payout
confirm payout
cascade history
support tickets
audit log
future configuration/settings
```

Consequential actions require confirmation.

Historical sequence/rules/winners cannot be edited.

---

## 28. Admin settings

Settings may configure only future behavior:

```text
future milestones
future reward amounts
claim deadlines
additional-info deadlines
feature flags
future rule versions
email configuration
future payment provider config
```

Admins cannot modify:

```text
reached milestones
historical reward values
takeover numbers
historical rule versions/hashes
finalized winners
hash-chain history
```

---

## 29. Winner ↔ admin chat

Inside the protected claim portal include private realtime chat.

Use Convex realtime.

Purpose:

```text
claim questions
missing information
eligibility clarification
payout coordination
```

Not general social chat.

Message max:

```ts
CHAT_MESSAGE_MAX_CHARS = 5_000;
CHAT_MESSAGES_PER_MINUTE = 10;
```

Plain text only.

No arbitrary HTML.

No arbitrary chat attachments.

Required documents use the private document system.

---

## 30. Chat email notifications

Do not email for every admin message.

Use:

```ts
WINNER_CHAT_EMAIL_DELAY_MINUTES = 10;
```

Flow:

```text
admin sends messages
↓
wait 10 minutes
↓
winner reads conversation
→ cancel email

winner does not read
→ send one combined unread-message email
```

Messages inside one pending window are coalesced.

---

## 31. Admin message inbox

Implement:

```text
/admin/messages
```

Display:

```text
milestone
takeover number
public wall identity/domain/display name
claim status
last message
last activity
unread status
```

Admin can jump directly to claim review.

---

## 32. Public informational pages

Implement:

```text
/about
/support
/contact
/rewards
```

Keep them simple and consistent with the minimal visual style.

Public footer:

```text
About
Support
Contact
Reward Rules
Privacy
Terms
```

Do not turn `/` into a traditional SaaS website.

---

## 33. About page

Explain simply:

```text
There is one live wall.

Pay $3.99 and put your website, app,
social profile, yourself, or a message on it.

You own it until somebody else pays $3.99.

Milestone walls are permanent.
```

---

## 34. Support page

Cover:

```text
how ownership works
what $3.99 buys
website/app/social/personal walls
immediate replacement
analytics
payments/refunds
milestone rewards
claim deadlines
permanent walls
content restrictions
technical issues
reporting malicious content
```

---

## 35. Contact page

Fields:

```text
Name optional
Email required
Topic
Message
```

Topics:

```text
General question
Payment issue
Wall issue
Milestone reward
Report content
Technical problem
Business inquiry
Other
```

Store in Convex.

Defaults:

```ts
SUPPORT_MESSAGE_MAX_CHARS = 10_000;
```

Add:

```text
rate limiting
honeypot
basic bot protection
```

Do not require CAPTCHA unless abuse makes it necessary.

---

## 36. Admin support inbox

Implement:

```text
/admin/support
```

Statuses:

```text
open
in_progress
resolved
spam
```

Admin responses are sent by transactional email and stored in ticket history.

Incoming email synchronization is NOT V1.

Customer email replies may go to a monitored support mailbox.

---

## 37. Transactional email

If no provider exists, use Resend behind an abstraction.

Required templates:

```text
provisional winner
claim link
claim link resend
OTP
claim reminder
additional information request
claim approved
claim ineligible
claim expired
payout sent
payout confirmed
winner unread chat
support reply
```

Initial claim reminders:

```text
immediate
3 days remaining
24 hours remaining
expiration
```

Additional-info reminders:

```text
request immediately
24 hours remaining
expiration
```

---

## 38. Private-route analytics

Disable VisitorPing entirely on:

```text
/admin/*
/reward/claim/*
```

Use:

```text
noindex
noarchive
```

where appropriate.

Never send to analytics/logging:

```text
claim token
OTP
government ID information
tax data
private documents
private messages
bank/payout details
```

---

## 39. Reward feature flags

Support:

```ts
MILESTONE_REWARDS_ENABLED
MILESTONE_PAYOUTS_ENABLED
MILESTONE_PUBLIC_PROMOTION_ENABLED
```

Meaning:

```text
REWARDS_ENABLED
→ backend workflow active

PAYOUTS_ENABLED
→ monetary payout can be finalized

PUBLIC_PROMOTION_ENABLED
→ homepage/milestone pages advertise cash prizes
```

This allows full development/testing without requiring production reward activation.

---

## 40. Implementation order

Implement in this order unless the existing architecture strongly suggests a safer dependency order:

```text
1. inspect existing repository
2. schema/migrations
3. $3.99 price
4. atomic takeover numbering
5. generic linked/personal wall-content model
6. update current wall rendering/CTA behavior
7. milestone configuration
8. future milestone teaser routes
9. milestone detection + cascade
10. reward rules versioning
11. audit hash chain
12. claim token + OTP/session
13. winner portal
14. admin authentication/dashboard
15. eligibility/operator review
16. winner/admin chat
17. manual wire payout
18. permanent trophy finalization
19. verification overlay
20. homepage permanent-wall section
21. about/support/contact/rewards
22. transactional email/reminders
23. private document upload only if actually required
24. external audit timestamping
```

---

## 41. Maintain existing behavior

Do not rewrite working V1 systems unnecessarily.

Preserve:

```text
one live wall
last successful payment owns it
no public accounts
no signup
no login
Stripe-hosted checkout
public realtime analytics
VisitorPing integration
Convex realtime
existing logo/image flow where compatible
Vercel deployment
```

This is a delta implementation, not a rewrite.

---

## 42. Engineering process

Before modifying code:

1. inspect current schema/components/integrations
2. document how this delta maps onto existing architecture
3. consolidate the addenda into one implementation spec
4. update `IMPLEMENTATION_STATUS.md`
5. implement incrementally

For every logical unit:

```text
implement
test
lint
typecheck
fix
commit
continue
```

Use separate logical Git commits.

Do not stop after scaffolding.

Do not ask another product question unless there is a genuine contradiction that cannot be resolved from these requirements or the existing repository.

Any deviation from a business-critical value above must be recorded in `IMPLEMENTATION_STATUS.md` with the reason.
