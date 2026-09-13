# Local currency and automatic tax

New Checkout Sessions enable Adaptive Pricing and Stripe Tax. The base price is $3.99 USD, with tax added on top (`tax_behavior: exclusive`). Stripe shows eligible local-currency choices and the final total before payment. Its conversion rate includes a conversion fee.

## Required Stripe account setup before deployment

Complete Stripe Tax setup separately in test and live mode: business/head-office address, the appropriate product tax classification, and actual tax registrations in jurisdictions where you collect tax. Automatic tax does not register the business or automatically handle every filing obligation. Check Adaptive Pricing eligibility/settings for the account as well.

On September 13, 2026, the connected test account reported Tax status `pending`, missing `head_office`, no default tax code, and no registrations. Live account configuration was not inspected. New automatic-tax checkouts cannot be verified against the real test account until setup is completed. Do not deploy the new checkout configuration before live Stripe Tax setup is ready.

Optional `STRIPE_TAX_CODE` (Next.js/Vercel server environment) sets the tax classification for an inline product. Otherwise Stripe's account default applies. If `STRIPE_PRICE_ID` is configured, the code validates its $3.99 USD one-time price, reuses its product/tax classification, and creates an inline price with exclusive tax behavior. It does not mutate the existing Stripe price.

## Verification and records

Webhook, recovery, and resume paths check the USD base subtotal, automatic-tax completion for paid sessions, exact base-plus-tax total, and absence of discounts/shipping. Existing untaxed $3.99 checkouts remain valid. Attached existing sessions are retrieved on checkout retries rather than recreated with different settings.

Purchases store the gross USD total (`amountCents`), tax (`taxCents`), and optional customer-currency minor-unit amount/currency (`presentmentAmount`, `presentmentCurrency`). Daily takeover revenue remains $3.99 excluding tax. Do not divide every presentment amount by 100: some currencies use other minor-unit conventions. Stripe remains the source for tax reports and receipts.

After Stripe test setup is ready, test a local-currency checkout with a `+location_FR` test-email suffix, a billing address in a configured test registration jurisdiction, and a Stripe test card. Verify the final tax, converted total, webhook activation, and stored amounts. No real charge or email was sent during automated testing.

References: [Adaptive Pricing](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=embedded-page), [Checkout tax setup](https://docs.stripe.com/tax/checkout/page), [Tax and Adaptive Pricing](https://docs.stripe.com/tax/calculating/adaptive-pricing).
