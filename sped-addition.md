# TakeTheWall — Milestone Rewards & Permanent Walls Addendum

## 1. Scope

Extend the existing TakeTheWall implementation with:

* fixed price change to **$3.99**
* sequential takeover numbers
* milestone cash rewards
* permanent milestone trophy pages
* provisional winner handling
* protected winner claim flow
* eligibility verification
* sequential fallback to the next purchaser when a provisional winner is ineligible
* cryptographic takeover audit trail
* milestone/rules disclosure page
* winner notification email
* live milestone verification overlay while a reward is unresolved

Do not rebuild or duplicate existing wall, Stripe Checkout, analytics, VisitorPing, Convex, or takeover functionality unless required for these changes.

---

# 2. Price Change

Change takeover price from:

```text
$2.99
```

to:

```text
$3.99 USD
```

Server remains authoritative.

Never trust a price supplied by the client.

```ts
TAKEOVER_PRICE_CENTS = 399;
```

Update:

* Stripe Checkout
* UI
* metadata
* marketing copy
* tests
* terms/disclosures

Primary CTA:

```text
TAKE THE WALL — $3.99
```

---

# 3. Sequential Takeover Number

Every successfully activated paid takeover must receive a permanent monotonic number.

Examples:

```text
#1
#2
#3
...
#99
#100
#101
...
#1000
```

Add:

```ts
takeoverNumber: number
```

to each activated takeover.

The number must be allocated atomically in Convex when the payment is successfully activated.

Do not assign the permanent number when Checkout is merely created.

Do not use browser timestamps to decide numbering.

Required invariant:

```text
One successful activation = exactly one unique takeover number.
```

Duplicate Stripe webhook processing must never allocate another number.

---

# 4. Display Takeover Number

Show the current active number publicly:

```text
CURRENT TAKEOVER

#847
```

This should update in real time when ownership changes.

---

# 5. Milestone Configuration

Do not hardcode milestone behavior throughout the codebase.

Initial configuration:

```ts
[
  {
    takeoverNumber: 100,
    rewardUsd: 100,
    route: "/100"
  },
  {
    takeoverNumber: 1000,
    rewardUsd: 1000,
    route: "/1000"
  },
  {
    takeoverNumber: 10000,
    rewardUsd: 10000,
    route: "/10000"
  },
  {
    takeoverNumber: 100000,
    rewardUsd: 100000,
    route: "/100000"
  },
  {
    takeoverNumber: 1000000,
    rewardUsd: 1000000,
    route: "/1000000"
  }
]
```

Milestones must remain configurable.

---

# 6. Milestone Candidate

When:

```text
takeoverNumber === milestone.takeoverNumber
```

that purchaser becomes the:

```text
PROVISIONAL MILESTONE WINNER
```

Do not immediately mark them as the final winner.

Create a milestone reward record:

```ts
{
  milestoneNumber: 1000,
  rewardUsd: 1000,

  originalCandidateTakeoverNumber: 1000,
  currentCandidateTakeoverNumber: 1000,

  status: "pending_claim"
}
```

---

# 7. Winner Cascade

If the provisional candidate cannot receive the reward, move forward sequentially.

Example:

```text
#1000 → ineligible
#1001 → expired
#1002 → eligible

#1002 receives the $1,000 reward.
```

No random redraw.

No administrator-selected replacement.

No arbitrary skipping.

If the next takeover does not yet exist:

```text
status = "awaiting_successor"
```

When that takeover is eventually created, automatically initiate its claim process.

---

# 8. Multiple Rewards

A takeover may receive multiple rewards if cascade behavior legitimately creates that situation.

Example:

```text
#100 reward cascades to #1000

#1000 also independently reaches
the $1,000 milestone

Total rewards:
$1,100
```

Do not automatically disqualify someone because they already received another milestone reward.

---

# 9. Claim Deadline

Default:

```text
7 calendar days
```

Store:

```ts
claimDeadlineAt: number
```

If the candidate does not complete the required claim process:

```text
status = expired
```

then cascade.

Deadline must be configurable.

---

# 10. Winner Email

Stripe Checkout must collect purchaser email if not already enabled.

For each provisional winner generate:

```text
claimToken
claimCode
```

Email:

```text
You hit Takeover #1,000.

You are the provisional recipient of the
$1,000 TakeTheWall milestone reward.

Claim deadline:
[DATE]

Claim your reward:
[PROTECTED LINK]

Claim code:
814729

Eligibility verification is required.
```

---

# 11. Protected Claim URL

Add:

```text
/reward/claim/[token]
```

Use cryptographically secure randomness.

Recommended entropy:

```text
>= 256 bits
```

Store only:

```ts
claimTokenHash
```

Never store the raw token.

---

# 12. Claim Code

Generate a separate six-digit code.

Example:

```text
814729
```

Store:

```ts
claimCodeHash
```

Flow:

```text
protected URL
      ↓
enter claim code
      ↓
validate token + code
      ↓
create claim session
      ↓
eligibility form
```

Recommended maximum:

```text
5 failed attempts
```

Rate-limit failures.

---

# 13. Claim States

```ts
type RewardClaimStatus =
  | "pending_claim"
  | "code_verified"
  | "information_required"
  | "under_review"
  | "additional_information_required"
  | "approved"
  | "paid"
  | "ineligible"
  | "expired"
  | "awaiting_successor";
```

All state changes must be auditable.

---

# 14. Eligibility Form

First collect:

```text
Country of residence
Date of birth / age
Legal name
```

Then dynamically determine additional requirements.

Architecture:

```ts
getClaimRequirements({
  country,
  region,
  prizeUsd
})
```

Potential fields:

```text
legal first name
legal last name
date of birth
residential address
country
state/province/region
email
phone

government ID
tax identification
tax forms
residency declaration
payout information
eligibility declarations
rules acceptance
```

Do not collect fields unnecessarily.

---

# 15. Eligibility Decision

Internal result:

```ts
{
  eligible: boolean,
  reasons: string[],
  requiredActions: string[],
  reviewedAt?: number
}
```

Possible ineligibility reasons include:

```text
payment refunded
payment charged back
fraudulent transaction
identity cannot be verified
false information submitted
claim deadline expired
required tax information missing
sanctions restriction
payment-provider restriction
payout-provider restriction
applicable law prevents payout
participant below required age
purchase violated site rules
```

Do not expose sensitive internal verification details publicly.

---

# 16. Worldwide Wording

Do not promise universal guaranteed eligibility.

Use:

> TakeTheWall is available globally. Milestone rewards are available wherever participation, verification, and payout are permitted by applicable law and our payment and payout providers.

If the candidate fails eligibility:

```text
cascade to next takeover.
```

---

# 17. Rewards / Disclosure Page

Add:

```text
/rewards
```

Include:

* milestone schedule
* reward values
* takeover numbering method
* provisional winner definition
* sequential cascade
* claim deadline
* eligibility verification
* worldwide availability wording
* sanctions restrictions
* payment/payout-provider restrictions
* applicable legal restrictions
* tax responsibility
* chargeback/refund rules
* payout requirements
* permanent milestone-wall rules
* cryptographic audit explanation
* no guaranteed duration/impressions/clicks from purchasing the live wall
* reward subject to eligibility verification

Rules must be versioned.

---

# 18. Rules Versioning

Each milestone must reference:

```ts
rewardRulesVersion
rewardRulesHash
```

Generate:

```text
SHA256(canonicalRulesJson)
```

Do not silently modify historical rules after a milestone is reached.

---

# 19. Cryptographic Takeover Chain

Every successful takeover becomes part of an append-only hash chain.

Add:

```ts
previousAuditHash?: string
auditHash: string
```

Canonical payload includes:

```text
takeoverNumber
publicTakeoverId
activatedAt
amountCents
currency
domain
previousAuditHash
```

Calculate:

```text
auditHash = SHA256(canonicalPayload)
```

Conceptually:

```text
#998 → hash A
          ↓
#999 → hash B
          ↓
#1000 → hash C
          ↓
#1001 → hash D
```

Historical modification must cause verification failure.

---

# 20. Public Takeover IDs

Do not expose:

```text
Stripe IDs
email
personal identity
payment data
```

Generate:

```ts
publicTakeoverId
```

Example:

```text
ttw_83f8da29...
```

---

# 21. External Timestamp Anchoring

Support periodic anchoring through:

```text
OpenTimestamps
```

Store:

```ts
auditCheckpoint {
  fromTakeoverNumber
  toTakeoverNumber
  finalHash
  timestampProof
  createdAt
}
```

Takeovers must never wait for external timestamp confirmation.

---

# 22. Permanent Milestone Routes

Support:

```text
/100
/1000
/10000
/100000
/1000000
```

Dynamic routing is acceptable:

```text
/[milestone]
```

but only known milestone numbers should resolve.

Everything else returns 404.

---

# 23. Unresolved Milestone Page

Before finalization:

```text
takethewall.com/1000
```

shows:

```text
🏆 $1,000 MILESTONE

Takeover #1,000 has been reached.

Winner verification is in progress.
```

Do not publish the permanent winner advertisement yet.

---

# 24. Permanent Trophy Wall

After final eligibility and payout:

Create an immutable snapshot:

```ts
milestoneWinnerSnapshot {
  milestoneNumber
  rewardUsd

  winningTakeoverNumber

  websiteUrl
  domain
  displayName
  description
  logoStorageId

  originalActivatedAt
  originalReplacedAt

  originalImpressions
  originalUniqueVisitors
  originalClicks
  originalCtr

  awardedAt
  paidAt
}
```

Do not dynamically use the active takeover record.

---

# 25. Milestone Page Design

Example:

```text
TAKE THE WALL

        🏆

THE $1,000 WALL

MILESTONE #1,000

[LOGO]

VisitorPing

Know who's on your website right now.

VISIT WEBSITE →

────────────────

WINNING TAKEOVER
#1,002

PRIZE
$1,000

AWARDED
September 2026

────────────────

ORIGINAL REIGN
03h 17m 42s

IMPRESSIONS
18,291

CLICKS
1,041

CTR
5.69%

────────────────

THIS WALL IS THEIRS FOREVER.

Fight for the live wall →
```

No takeover control belongs on this permanent page.

---

# 26. Permanent Link Safety

Store:

```ts
outboundLinkEnabled: boolean
```

If a milestone winner's future destination becomes:

```text
malicious
phishing
illegal
compromised
expired
unsafe
```

disable only the outbound link.

Do not remove the historical trophy.

---

# 27. Homepage Milestone Progress

Show a compact component:

```text
CURRENT TAKEOVER

#847

NEXT MILESTONE

#1,000
$1,000 REWARD

153 TAKEOVERS TO GO
```

Near milestone:

```text
3 TAKEOVERS UNTIL
THE $1,000 MILESTONE
```

---

# 28. Permanent Walls Section

Homepage can show:

```text
PERMANENT WALLS

🏆 #100
example.com
$100

🏆 #1,000
visitorping.com
$1,000

🔒 #10,000
Not reached yet
```

Finalized entries link to permanent milestone pages.

---

# 29. Milestone Verification Overlay

When a milestone has been reached but its reward has **not yet been finalized**, automatically show a live verification overlay on the main `/` page.

Purpose:

* make provisional winner handling visible
* show exact takeover sequence
* demonstrate that succession is deterministic
* make cascade behavior transparent
* create excitement while verification is happening

The overlay must be driven by Convex realtime state.

---

## 29.1 Overlay Trigger

Show whenever any milestone has an unresolved status such as:

```text
pending_claim
code_verified
information_required
under_review
additional_information_required
awaiting_successor
approved-but-not-paid
```

Do not show for:

```text
not_reached
paid
```

If multiple milestones somehow remain unresolved simultaneously, prioritize the largest/currently most relevant milestone and allow switching if necessary.

---

## 29.2 Desktop Design

Display as a non-blocking fixed side panel.

Recommended placement:

```text
right side of viewport
vertically centered or near top-right
```

Example:

```text
┌─────────────────────────────────┐
│ 🏆 $1,000 MILESTONE             │
│ Verification in progress        │
│                                 │
│ TAKEOVER SEQUENCE               │
│                                 │
│ #997  acme.com                  │
│ #998  startup.ai                │
│ #999  example.io                │
│                                 │
│ #1000 visitorping.com       ←   │
│        PROVISIONAL              │
│                                 │
│ #1001 nextsite.com              │
│ #1002 another.co                │
│ #1003 sample.dev                │
│                                 │
│ Status: Under review            │
│                                 │
│ View milestone →                │
│                           [×]   │
└─────────────────────────────────┘
```

The panel must not prevent:

* viewing the wall
* clicking the current owner
* taking the wall
* normal scrolling

---

# 29.3 Mobile Design

Do not use a permanently expanded side panel.

Display a small fixed pill/button:

```text
🏆 $1,000 verification
```

Tap opens a bottom sheet containing the same takeover sequence.

Example:

```text
┌────────────────────────────┐
│ $1,000 MILESTONE           │
│ Verification in progress   │
│                            │
│ #997 acme.com              │
│ #998 startup.ai            │
│ #999 example.io            │
│ #1000 visitorping.com ←    │
│ #1001 nextsite.com         │
│ #1002 another.co           │
│ #1003 sample.dev           │
│                            │
│ PROVISIONAL: #1000         │
└────────────────────────────┘
```

Allow the sheet to be dismissed.

---

# 29.4 Sequence Window

Show:

```text
3 immediately before
+
current provisional candidate
+
3 immediately after
```

Conceptually:

```text
candidateNumber - 3
candidateNumber - 2
candidateNumber - 1
candidateNumber
candidateNumber + 1
candidateNumber + 2
candidateNumber + 3
```

If later takeovers do not yet exist, show placeholders:

```text
#1001 — waiting
#1002 — waiting
#1003 — waiting
```

Do not fabricate entries.

---

# 29.5 Public Information Per Row

Each row may expose:

```text
takeover number
domain
short UTC timestamp
public takeover ID
short audit hash
public milestone status
```

Recommended visible default:

```text
#1000 visitorping.com
```

Advanced/audit information may be expandable.

Never expose:

```text
email
real name
country
address
payment ID
claim code
eligibility documentation
private reason for rejection
```

---

# 29.6 Public Candidate Status

Allowed public labels:

```text
PROVISIONAL
VERIFYING
UNDER REVIEW
EXPIRED
INELIGIBLE
AWAITING CLAIM
APPROVED
PAID
```

Do not publicly disclose sensitive reasons.

For example:

Good:

```text
#1000 — INELIGIBLE
```

Bad:

```text
#1000 — rejected because government ID failed sanctions screening
```

---

# 29.7 Live Cascade Behavior

If #1000 becomes ineligible:

```text
#1000  INELIGIBLE
#1001  PROVISIONAL ←
```

If #1001 expires:

```text
#1000  INELIGIBLE
#1001  EXPIRED
#1002  PROVISIONAL ←
```

The overlay must update in realtime without page refresh.

The highlighted candidate moves automatically.

---

# 29.8 Candidate Beyond Original ±3 Range

If cascading advances far enough that the new provisional candidate leaves the original seven-record window, automatically recenter:

```text
candidate - 3
through
candidate + 3
```

Example:

Original candidate:

```text
#1000
```

Cascade eventually reaches:

```text
#1005
```

Panel now displays:

```text
#1002
#1003
#1004
#1005 ←
#1006
#1007
#1008
```

---

# 29.9 Overlay Dismissal

Desktop overlay and mobile sheet may be dismissed.

Dismissal should persist only for the current browser/session or milestone.

Suggested local storage key:

```text
dismissedMilestoneOverlay:1000
```

Do not permanently hide future milestone overlays.

A user who dismisses #1000 should still see #10000 when that milestone eventually occurs.

---

# 29.10 Finalization

Once:

```text
reward.status = paid
```

the unresolved verification overlay disappears automatically.

Replace it with a brief optional celebration:

```text
🏆 $1,000 MILESTONE FINALIZED

Takeover #1,002
visitorping.com

VIEW PERMANENT WALL →
```

This may auto-dismiss after several seconds.

The milestone is then permanently accessible at:

```text
/1000
```

---

# 29.11 Milestone Page Sequence

While unresolved, the permanent milestone route should also display the same sequence data.

Example:

```text
$1,000 MILESTONE

Winner verification in progress.

Takeover Sequence

#997
#998
#999
#1000 ← provisional
#1001
#1002
#1003
```

Once finalized, the trophy becomes the primary presentation.

Audit/sequence information can remain lower on the page for transparency.

---

# 29.12 Data Query

Add a public Convex query approximately:

```ts
getActiveMilestoneVerification()
```

Response:

```ts
{
  milestoneNumber: 1000,
  rewardUsd: 1000,

  status: "under_review",

  currentCandidateTakeoverNumber: 1000,

  sequence: [
    {
      takeoverNumber: 997,
      domain: "acme.com",
      publicTakeoverId: "...",
      activatedAt: 123,
      publicStatus: null
    },
    ...
  ]
}
```

Return only public-safe information.

---

# 29.13 Visual Priority

The milestone overlay must be noticeable but must **not become more visually dominant than the live wall itself**.

Priority remains:

```text
1. Current wall owner
2. Take the Wall CTA
3. Milestone verification overlay
```

---

# 30. Reward Data Model

Add:

```ts
milestoneRewards: {
  milestoneNumber: number,
  rewardUsd: number,

  originalCandidateTakeoverNumber: number,
  currentCandidateTakeoverNumber: number,

  winnerTakeoverNumber?: number,

  status:
    | "not_reached"
    | "pending_claim"
    | "under_review"
    | "awaiting_successor"
    | "approved"
    | "paid",

  claimDeadlineAt?: number,

  rulesVersion: string,
  rulesHash: string,

  awardedAt?: number,
  paidAt?: number,

  winnerSnapshotId?: Id<"milestoneWinnerSnapshots">
}
```

---

# 31. Reward Claims Model

```ts
rewardClaims: {
  milestoneRewardId: Id<"milestoneRewards">,

  takeoverId: Id<"takeovers">,
  takeoverNumber: number,

  purchaserEmail: string,

  claimTokenHash: string,
  claimCodeHash: string,

  failedCodeAttempts: number,

  status: RewardClaimStatus,

  claimDeadlineAt: number,

  country?: string,
  region?: string,

  legalName?: string,
  dob?: string,

  submittedData?: unknown,

  eligibilityReasons?: string[],

  createdAt: number,
  verifiedAt?: number,
  approvedAt?: number,
  rejectedAt?: number
}
```

Sensitive claim information must never appear in public Convex queries.

---

# 32. Transactional Email

Add a transactional provider if needed:

```text
Resend
Postmark
AWS SES
```

Required emails:

```text
provisional milestone winner
claim reminder
additional information requested
claim approved
reward paid
claim expired/ineligible
```

---

# 33. Claim Reminders

Recommended:

```text
initial notification

3 days remaining

24 hours remaining

expiration
```

Avoid unnecessary messages.

---

# 34. Payout Status

Separate:

```text
approved
```

from:

```text
paid
```

Store:

```text
payoutMethod
payoutReference
paidAt
```

Never expose sensitive payout details publicly.

---

# 35. Refund / Chargeback Behavior

Before reward payout:

```text
refund
chargeback
fraud
```

causes candidate ineligibility and cascade.

After reward payout:

```text
flag for administrative review
```

Do not implement automatic clawback without explicit logic.

---

# 36. Admin Reward Tools

Minimal protected functionality:

```text
view milestone
view provisional candidate
view claim submission
request additional information
approve claim
mark candidate ineligible
record payout
inspect cascade history
inspect audit chain
```

All actions create audit events.

---

# 37. Reward Audit Events

Add events:

```text
MILESTONE_REACHED
PROVISIONAL_WINNER_CREATED
CLAIM_EMAIL_SENT
CLAIM_CODE_VERIFIED
CLAIM_SUBMITTED
CLAIM_APPROVED
CLAIM_INELIGIBLE
CLAIM_EXPIRED
REWARD_CASCADED
REWARD_PAID
PERMANENT_WALL_PUBLISHED
```

Each includes:

```text
timestamp
actor
milestone
takeover number
metadata
```

---

# 38. Cascade History

Never overwrite previous candidates.

Example:

```text
Milestone #1,000

Takeover #1000
INELIGIBLE

Takeover #1001
EXPIRED

Takeover #1002
APPROVED

FINAL WINNER:
#1002
```

This history must remain auditable.

---

# 39. Homepage Wording

Preferred compact copy:

```text
#1,000 → $1,000 MILESTONE REWARD*
```

Nearby:

```text
*Subject to eligibility and Reward Rules.
```

Avoid claiming guaranteed eligibility before verification.

---

# 40. Reward Rules Link

Show:

```text
Reward Rules
```

close to milestone messaging.

Link:

```text
/rewards
```

Do not hide it only in the footer.

---

# 41. Privacy

Never publicly expose:

```text
legal identity
address
DOB
government ID
tax information
phone
email
bank information
claim token
claim code
private compliance reason
```

Permanent/public milestone content should be centered on:

```text
website
logo
description
takeover number
reward
milestone
public audit data
```

---

# 42. Tests

Add tests for:

```text
$3.99 pricing

atomic takeover numbering

duplicate Stripe webhook does not increment sequence

concurrent successful payments get unique numbers

milestone detection

provisional candidate creation

claim token generation/hashing

claim code generation/hashing

failed-code limiting

claim expiration

eligibility approval

ineligibility cascade

expiration cascade

cascade to future takeover

multiple rewards

winner snapshot freezing

permanent milestone routes

pending milestone routes

rules hash generation

audit hash-chain verification

tampered history detection

refund before payout

private claim-data protection

milestone verification overlay trigger

overlay hidden when no unresolved milestone

correct ±3 sequence calculation

missing future takeover placeholders

overlay recenters after cascade

public overlay query excludes private information

overlay disappears after reward paid
```

---

# 43. Migration

For existing production paid takeovers:

1. identify successfully activated takeovers
2. sort by authoritative activation order
3. assign sequential takeover numbers
4. generate audit chain
5. update global current takeover number
6. exclude failed/pending/abandoned Stripe sessions
7. ensure current owner remains unchanged

Seeded VisitorPing house placement does not count as a paid takeover unless explicitly configured otherwise.

If no paid takeovers exist:

```text
currentTakeoverNumber = 0
```

---

# 44. Completion Criteria

This addendum is complete when:

* price is $3.99
* every activated paid takeover gets one permanent number
* current takeover number is public
* milestone configuration works
* milestone candidates are generated
* protected claim email/token/code works
* eligibility information can be collected securely
* candidate can be approved/ineligible/expired
* sequential cascade works
* candidate history is preserved
* permanent milestone pages work
* unresolved pages show verification status
* finalized trophy snapshots cannot change
* `/rewards` exists
* rules are versioned and hashed
* takeover hash chain works
* audit anchoring is supported
* admin reward workflow works
* sensitive information remains private
* live milestone verification overlay works
* overlay shows provisional candidate ±3 takeovers
* cascade updates overlay in realtime
* mobile bottom sheet works
* overlay can be dismissed per milestone
* overlay disappears on final payout
* lint passes
* typecheck passes
* tests pass
* production build passes

---

# 45. Preserve Existing V1

Do not rewrite working V1 functionality.

Continue to preserve:

```text
one live wall
last successful payment owns it
no user accounts
no signup
no login
URL + logo + description
Stripe Checkout
public analytics
VisitorPing integration
Convex realtime
```

This addendum extends the current application rather than replacing it.
