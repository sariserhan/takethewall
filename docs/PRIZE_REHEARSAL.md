# Development prize rehearsal

Use only Convex development `aromatic-falcon-454` and the local app at http://localhost:3010. Production `canny-bee-832` is separate. Do not simulate payouts on the live website.

## Prepared settings

- Internal `rehearsal:prepare` creates milestones #1, #2 and #3 with nominal test rewards $1, $2 and $3.
- Reward creation, simulated payout recording and test promotion are enabled. Deadlines are one day.
- Rules are explicitly labeled DEVELOPMENT REHEARSAL ONLY; no bank transfer is made.
- Preparation refuses other deployments, non-test environments, and existing settings/history. Repeating preparation does not reset the rehearsal.
- Real milestone routes /100, /1000, /10000, /100000 and /1000000 remain available alongside /1, /2 and /3.
- Development public metrics and external audit anchoring are disabled.

## Mailbox and local app

Create testing@takethewall.com as a receiving mailbox or forwarding alias. Once it receives mail, add it to the development ADMIN_EMAILS allowlist (retain any existing administrators). Resend sender verification and a receiving mailbox are separate requirements. Never paste OTPs or claim links into public documents.

Start the app with the matching origin:

```sh
NEXT_PUBLIC_SITE_URL=http://localhost:3010 npm run dev -- --port 3010
```

The development Convex SITE_URL must also be http://localhost:3010. Ensure the app's Convex URLs refer to aromatic-falcon-454. Do not use production Stripe keys for the separate payment rehearsal.

## Dashboard walkthrough

1. Sign in at /admin using testing@takethewall.com after the mailbox and allowlist are ready.
2. Open /admin/publish. Publish a clearly labeled TEST website with Count toward milestones off. The wall updates; its counted total stays zero.
3. Publish TEST WINNER ONE with the toggle on and testing@takethewall.com as recipient. Check /1: it must show verification pending, not a permanent winner.
4. Open the claim email, request and enter the fresh OTP, accept the test rules and submit synthetic eligibility information. Never upload a real identity document for this rehearsal.
5. Exchange winner/admin chat messages. Request a synthetic document under /admin/claims and upload a sample PDF. Verify approval is blocked while a requested document is missing.
6. Approve with reason TEST ELIGIBILITY REVIEW. Confirming payment before marking it sent must fail.
7. Mark sent with reference TEST-NO-MONEY-001. /1 must still lack the permanent trophy. Confirm payment in the development dashboard; now /1 must show the winner snapshot.
8. Publish TEST WINNER TWO as another counted placement. Confirm #1 is replaced on the live wall but remains on /1. Original-reign metrics freeze after the late-event window and maintenance pass.
9. Reject candidate #2 with a test reason. /2 waits for takeover #3. Publish counted TEST WINNER THREE: it can become candidate for both #2 and #3. This is intentional successor behavior.
10. For deadline expiry, use the automated test suite to advance time instantly. The shared development walkthrough uses the actual one-day deadline; do not change server clocks or rewrite live history.
11. Inspect /100, /1000, /10000, /100000 and /1000000: each remains a separate full-viewport permanent page with the footer at the bottom.

## Automated evidence and limits

Run `npm run check` and the desktop/mobile enhancement Playwright suite. Backend tests exercise real mutations in convex-test with mocked identity/time/storage, including both Stripe-paid and admin-counted issuance through payout confirmation and frozen snapshots. They also cover OTP expiry/reuse, rejection/expiry succession, hash integrity, private chat/documents and authorization failures.

Automated tests do not send real email, contact a bank or prove live Stripe webhook delivery. Real inbox delivery and the authenticated browser walkthrough remain separate until the testing mailbox is ready. A Stripe test-mode Checkout is a separate rehearsal; counted admin publishing deliberately does not fabricate Stripe payments.

## Latest rehearsal preparation results

- `npm run check`: lint, TypeScript, 103 unit/backend tests and production build passed.
- Development backend deployment and guarded preparation succeeded.
- All eight routes (three test milestones plus five permanent milestones) loaded at 1440×900, 390×844 and 320×568 without horizontal overflow. Admin publishing remains behind sign-in.
- Development history is still empty: setup has not issued takeovers, queued claim emails or recorded payouts.
- Inbox delivery and authenticated dashboard walkthrough are pending creation of testing@takethewall.com.
