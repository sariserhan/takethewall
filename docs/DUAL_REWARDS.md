# $4.99 checkout, dual rewards, and free email entries

New checkout quotes are 499 USD cents, with applicable tax added separately. Each new purchase stores `basePriceCents`; a historical purchase without that field retains its 399-cent quote. Stripe webhook validation accepts either known price, and activation verifies the exact stored purchase quote. Resume emails use the saved quote. No historical purchase amounts or claim rules are rewritten.

## Enable the new rules

In `/admin`, open Settings, choose **Prepare dual rewards and free email entry rules**, review the configuration and rules, then **Save future configuration**. The preparation button does not save immediately. Existing saved settings retain their existing behavior until updated. A fresh installation defaults to the new rules. Existing rewards never gain a retroactive companion.

Publishing rules changes requires a new unused rules version. The supplied version is `2026-09-13.1`. Retain configured claim deadlines and milestone definitions when reviewing the proposed rules; reached definitions cannot change. Deploy the backend and frontend together. This implementation is not a determination of legal compliance or a substitute for reviewing the promotion's rules.

## Reward B

Every newly reached milestone with dual rewards enabled creates a companion reward and a durable selection job. Reward A uses the existing sequence claim process. Reward B uses the preceding cohort, from the preceding configured milestone through the number immediately before the new milestone (first cohort starts at 1).

Selection processes at most 200 referral or unique-visitor records per pass. Persisted cursors and scores make retries idempotent. Scores use referral event records and unique-visitor records from before the cutoff, including record creation order for same-millisecond boundaries. Display/demo counters do not contribute. Selection recovery runs through reward maintenance.

Rank by verified referrals, then unique wall visitors, then the earlier takeover number. At least one verified referral is required. Blocked or rejected content and invalid payment/recipient records cannot receive a claim. Failed or expired candidates advance within the frozen ranked cohort. Exhausting the cohort leaves B unawarded, without affecting A. Both claims reuse protected claim links, verification, audit, manual payout, and permanent content snapshots.

## Free email entry operations

Publish the email-entry rules before using this workflow. Instructions direct entrants to `contact@takethewall.com`, subject **Free wall entry**, with their name, email, display name, and desired ad text or URL. This code does not read the mailbox automatically.

In `/admin` → Publish, select **Process a free email entry**. Review valid emails in received order, copy the original Message-ID, enter the received timestamp in UTC, and enter the requested content and recipient email. Preview, then publish. Free entries always count and use the same atomic sequence, audit chain, referral tracking, and claim process. The Message-ID prevents duplicate issuance even across different administrators; its reference and receipt timestamp stay private. No Stripe payment or paid receipt is fabricated.

An email does not reserve a sequence number. The number is assigned at processing; paid activations may happen while an email awaits review. Keep processing timely and apply the published criteria consistently. Administrative counted placements remain recorded as $0 issuances. Identity documents belong in the protected claim portal, not email.

## Verification

Regression coverage includes historical checkout prices, rejection of underpayment on new quotes, tax totals, dual claim creation, cutoff exclusion, unique-visitor ties, ignored display counters, blocked candidates, fallback exhaustion, paginated score recovery, zero-referral cohorts, private free-entry records, idempotent free issuance, and administrator authorization. Desktop/mobile browser coverage checks the dual-reward milestone page and checkout presentation.
