# Takeover numbering

## Current production state — offset removed September 14, 2026

At the owner's request, production `canny-bee-832` now has
`siteStats.numberingOffset = 0`. The artificial +15 public numbering offset was
removed with Convex's audited dashboard document-patch mutation, scoped to that
single field on the wall's `siteStats` record. No application deployment was needed.

Before the correction, production had two published counted admin placements,
numbered 1 and 2 internally, and no milestone rewards, reward claims, or
performance selections. The artificial numbers were an offset, not 15 database
records. No takeovers, purchases, or audit entries were deleted or renumbered.
Pending payment drafts remain pending. Other demo statistics were not changed;
the demo takeover-count contribution was already zero.

After the correction:
- `wall:current` returned `totalTakeovers: 2` and current owner number 2
  (previously public number 17).
- `referralLeaderboard:rebuild` completed for the new numbering configuration.
- `auditTrail:verify` returned `valid: true`, `reason: null`, `next: null`,
  matching its result before the correction.

Future counted activations continue from the actual recorded sequence. The
stored zero also prevents `numbering:initialize` from reapplying the launch offset.
Historical rules snapshots and cryptographic proofs remain unchanged.

## Historical launch configuration — do not reapply

The one-time offset is stored as `siteStats.numberingOffset = 15`.
`siteStats.totalTakeovers` and `takeovers.takeoverNumber` remain the actual
recorded count and immutable audit sequence. No synthetic takeover, purchase,
payment, reward claim, or checkpoint is created.

Public owner numbers, counted totals, admin numbers and milestone progress add
this offset. The first recorded takeover appears as #16, the next as #17.
Milestone eligibility follows public numbers: #100 maps to actual record #85.
Claims store the public candidate number, and candidate lookup subtracts the
offset to find the actual owner. House placements do not increment either count.

Audit entries and existing SHA-256 checkpoints keep their original sequence
numbers and hashes. The audit entries endpoint exposes `numberingOffset`
separately; clients must keep it outside the hashed payload. Milestone audit
rows expose the original audit sequence alongside the public number.

The count and milestone UI disclose the offset. Rules version 2026-09-12.1
documents this mapping; already-snapshotted reward rules are not rewritten.

### Historical initialization procedure

Deploy the frontend disclosure and backend from this commit before enabling the
offset. Confirm the intended production deployment and obtain operator approval.
The initialization function is internal and is not exposed to browser clients.

For the original launch state (one recorded counted takeover):

```sh
npx convex run --prod numbering:initialize '{"expectedRecordedCount":1}'
```

Expected result: `{"offset":15,"currentNumber":16}`. The transaction refuses
changed counts, more than one existing counted takeover, active audit migration,
existing reward obligations, or crossing a configured milestone. It is
idempotent after initialization and writes one `NUMBERING_OFFSET_INITIALIZED`
admin audit entry. Repeating it does not increment the offset.

Verify `wall:current` exposes offset 15, total 16 and owner number 16;
`rewards:overview` reports currentNumber 16; and `auditTrail:verify` remains valid.
The actual takeover, purchase and audit entry counts must be unchanged.

The offset is locked. Do not remove or change it once numbering has been used;
that would alter future milestone mapping. Any correction requires a separately
reviewed migration accounting for existing reward obligations.
