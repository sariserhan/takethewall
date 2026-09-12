# Launch numbering offset

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

## Apply once

Deploy the frontend disclosure and backend from this commit before enabling the
offset. Confirm the intended production deployment and obtain operator approval.
The initialization function is internal and is not exposed to browser clients.

For the current production state (one recorded counted takeover):

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
