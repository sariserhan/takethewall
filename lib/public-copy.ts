import { LEGAL_VERSION } from "./config";
export const legalVersion = LEGAL_VERSION;
export const publicCopy: Record<
  string,
  { title: string; intro: string; sections: { title: string; body: string }[] }
> = {
  about: {
    title: "ONE WALL. YOUR MOMENT.",
    intro:
      "Pay $4.99 and put your website, app, social profile, yourself, or a message on the wall. It stays until the next successful purchase takes over.",
    sections: [
      {
        title: "No account. No reserved spot.",
        body: "Choose your content, preview it, and pay through hosted Checkout. Successful payment activation assigns your takeover number. Opening Checkout does not reserve a number or place in line.",
      },
      {
        title: "One second or 100 days",
        body: "Nobody knows how long a reign will last. Another payment may replace yours immediately. There is no minimum duration, audience, or advertising result.",
      },
      {
        title: "A place in history",
        body: "Configured milestones have their own permanent pages. Where rewards are enabled, a provisional recipient must complete eligibility review and receive confirmed payout before a trophy is published. Read the Reward Rules for the full conditions.",
      },
    ],
  },
  support: {
    title: "SUPPORT",
    intro: "Answers for your live wall, payment, and milestone claim.",
    sections: [
      {
        title: "What does $4.99 buy?",
        body: "One successfully activated public placement. You can promote a website, app, social profile, yourself, or a short message. Personal placements do not need a URL. Purchases do not require accounts.",
      },
      {
        title: "What if I am replaced immediately?",
        body: "The next successfully activated payment takes the live wall. Short duration and low traffic are part of the product and do not by themselves qualify for a refund. Mandatory consumer rights remain unaffected.",
      },
      {
        title: "I paid but my content is not visible",
        body: "Your placement may be awaiting payment confirmation or may already have been replaced. Use your confirmation link before paying again. Contact support with your receipt reference if the problem persists; never send card details.",
      },
      {
        title: "How do analytics work?",
        body: "Convex maintains immediate site and reign counters; VisitorPing receives sanitized public-wall events and provides separate aggregate reports. Browser identifiers estimate visitors. They are not verified-person counts. Bot filtering and country inference are best effort.",
      },
      {
        title: "How do milestone claims work?",
        body: "A reached, enabled milestone creates a provisional recipient. Submit within seven calendar days by default. Internal review does not count against that deadline; requested additional information has a separate deadline. The rules version bound to your reward controls. Ineligible or expired sequence claims move to the next eligible counted takeover. Where dual rewards are enabled, the referral reward passes to the next ranked eligible entrant in its cohort, or remains unawarded.",
      },
      {
        title: "What is a permanent wall?",
        body: "After approved eligibility and confirmed payout, the milestone page preserves the winning content. Original-reign metrics freeze after replacement and the late-event allowance. A later purchase cannot overwrite it. Unsafe destination links can be disabled.",
      },
      {
        title: "How do I report harmful content?",
        body: "Use Contact → Report content with the public takeover number or URL and an explanation. Do not submit malware, phishing, illegal content, impersonation, or material you do not have permission to use.",
      },
      {
        title: "Technical problems or refunds",
        body: "Use the contact form for duplicate charges, a paid placement that never activated because of a system failure, suspected fraud, or technical issues. Payment-provider and applicable legal requirements still apply.",
      },
    ],
  },
  terms: {
    title: "TERMS OF USE",
    intro:
      "These terms describe purchases and public content on TakeTheWall. Reward-specific conditions are in the versioned Reward Rules.",
    sections: [
      {
        title: "The live wall purchase",
        body: "A $4.99 USD payment buys one public placement after successful server-verified activation. Website, app, social, and personal/message placements are supported. The next successfully activated payment replaces the current placement. Checkout creation does not reserve a sequence number. No minimum duration, audience, impressions, clicks, revenue, or other result is promised.",
      },
      {
        title: "Payment and refunds",
        body: "Stripe currently processes hosted Checkout payments. We do not receive full card numbers. Short reigns, low traffic, replacement by another purchaser, and changes of mind do not by themselves qualify for a refund. Contact support for duplicate charges, paid placements that never activated because of a system failure, fraud, or payment-provider requirements. Nothing excludes rights or remedies that applicable law requires.",
      },
      {
        title: "Content and permission",
        body: "Submit only content you are entitled to publish. You grant TakeTheWall permission to store, display, resize, and distribute the submitted content for the live placement, its historical record, and any earned trophy placement. You do not need to own a website. A display name must not misleadingly impersonate another person or organization.",
      },
      {
        title: "Content restrictions and moderation",
        body: "Phishing, malware, credential theft, fraud, illegal goods/services, exploitative sexual content, explicit pornography, terrorist promotion, and unlawful impersonation are prohibited. Public images are PNG, JPEG, or WEBP up to 2 MB; scripts, arbitrary HTML, SVG uploads, and embedded pages are not accepted. Harmful live content may be removed and its destination disabled. Historical numbers and audit records are preserved.",
      },
      {
        title: "Milestones and permanent placements",
        body: "A milestone candidate is provisional. Eligibility review, required information, applicable restrictions, and confirmed manual payout determine finalization. The Reward Rules govern cascade and deadlines. Permanent trophy content is preserved as historical placement for the operating life of TakeTheWall, subject to mandatory legal obligations; it is not a promise that the service or domain will exist indefinitely. Unsafe outbound links can be disabled.",
      },
      {
        title: "Private claims and support",
        body: "Protect claim links and verification codes. Submit accurate eligibility information through the protected portal, and use requested document uploads rather than public content or chat for sensitive documents. Ordinary purchases require no account; administrators use separate authenticated access.",
      },
      {
        title: "Changes and contact",
        body: "The version accepted with your purchase is recorded. Reached milestones retain their rules version, hash, reward value, and definition. Material future changes do not silently rewrite those records. Purchase questions: support@takethewall.com. Privacy requests: privacy@takethewall.com.",
      },
    ],
  },
  privacy: {
    title: "PRIVACY NOTICE",
    intro:
      "Public wall content and private purchase, support, and reward information have different purposes and access controls.",
    sections: [
      {
        title: "What is public",
        body: "Your chosen public display name, image, description/message, destination, paid takeover number, activation history, and aggregate statistics may be displayed publicly. Finalized milestone trophies preserve a snapshot of this content. Do not put private information into a public placement. A claim legal name is not published merely because it was submitted for verification.",
      },
      {
        title: "Private purchase and support information",
        body: "We store purchase and free-entry email, free-entry message references and receipt times, payment references, status, and necessary support correspondence to fulfill purchases, provide notices, handle problems, and maintain operational records. An administrator-only contact directory records email addresses, their source, subscription preferences, and email delivery status and timestamps. It does not expose message bodies or sign-in links. Optional updates are paused after a recorded hard bounce or spam complaint. Contact-email deletion retains a hashed stop marker to prevent background indexing from restoring the deleted address. Purchase is not consent to marketing. Wall-change emails require separate signup and confirmation, with a choice of every takeover or a daily summary; each update includes preferences and unsubscribe links. Milestone alerts require a separate signup and email confirmation; every milestone alert includes an unsubscribe link. Owners can choose a weekly performance summary while their takeover remains live, and unsubscribe in the dashboard or email. Stripe handles payment details; TakeTheWall does not store complete card numbers.",
      },
      {
        title: "Reward claim information",
        body: "A provisional recipient may provide residence country/region, legal name, date of birth, declarations, and specifically requested eligibility information or documents. We use this information for eligibility review, claim communication, and lawful manual payout. Authorized administrators and the authenticated claimant can access the appropriate private records. Authentication tokens and OTPs are hashed at rest; private messages and documents never become public analytics.",
      },
      {
        title: "Service providers",
        body: "Vercel serves the application, Convex stores application data and supplies realtime updates, Stripe processes payments, Resend sends transactional email, and VisitorPing receives sanitized public-wall events and supplies analytics reports. Better Auth runs with Convex to handle administrator sign-in. Cloudflare manages domain DNS. These providers process the data needed for their respective functions under their own applicable terms. Private admin, owner-dashboard and reward-claim pages have VisitorPing disabled.",
      },
      {
        title: "Browser storage and analytics",
        body: "A first-party browser identifier helps estimate site, UTC-day, and reign visitors and is hashed before database storage. These are pseudonymous browser estimates, not verified people or a promise of complete anonymity. Clearing storage or changing browsers may count again. Country is inferred from hosting request metadata. Public event payloads exclude payment references, buyer emails, query strings, fragments, and claim secrets. Keep or Yeet voting uses an HTTP-only browser cookie lasting up to one year. We store a keyed hash of that identifier with your choice for each takeover and use network hashes for request limits. Public results show aggregate votes, not voter identifiers. Clearing cookies or changing browsers can count again. The draft form is kept in tab session storage and removed after confirmed payment or tab closure. Owner dashboards use a private email link and a secure HTTP-only cookie lasting up to 30 days. Share cards use a separate public link without dashboard credentials. Visiting a tracked share link stores a signed, HTTP-only referral cookie for up to 30 days. We retain a separately hashed browser identifier per shared takeover to estimate unique referred browsers; clearing storage can count again. The last eligible shared link visited receives credit for a subsequent paid takeover. Referral totals are separate from clicks to an owner’s destination, and test payments and identifiable self-referrals are excluded. Claim sessions use a secure HTTP-only cookie and expire after 12 hours; the portal receives a session credential in memory for authorized realtime access.",
      },
      {
        title: "Retention",
        body: "Unreferenced public uploads have a 48-hour cleanup grace period. Unpaid purchase contact data is normally deleted after 30 days; paid contact data after one year or after the active reign ends if later. Reward claims, support correspondence, and operational audit records are retained while needed for their stated purposes and applicable obligations. Requested private documents default to deletion 90 days after claim finalization unless a documented retention requirement overrides that period. Historical public creative and aggregate statistics may remain. Deleting a contact does not necessarily erase legally required payment records or public history.",
      },
      {
        title: "Your choices and requests",
        body: "Contact privacy@takethewall.com to ask about access, correction, deletion, or other rights available under applicable law. We may need proportionate verification to protect your data. Provide a receipt reference when relevant, never full payment-card details. Use the private portal for sensitive reward documents.",
      },
    ],
  },
  disclaimer: {
    title: "DISCLAIMER",
    intro:
      "Understand what a placement, analytics count, and milestone status mean before purchasing.",
    sections: [
      {
        title: "No performance or duration guarantee",
        body: "A live placement can be replaced immediately by the next successful payment. We make no promise about exposure time, audience size, impressions, clicks, geographic distribution, conversions, earnings, or return on your purchase.",
      },
      {
        title: "Analytics estimates",
        body: "Visitor counts estimate browser activity. They may be affected by blockers, network failures, identifier resets, bots, and delayed events. Country inference is approximate. Server-relayed custom-event reports use our traffic checks rather than VisitorPing’s server bot classification. VisitorPing reports are eventually consistent and limited to the requested retained history; they are not added to Convex's immediate counters.",
      },
      {
        title: "Provisional rewards",
        body: "Reaching a milestone does not establish unconditional eligibility or confirmed payment. Claims require verification under the bound Reward Rules. Availability depends on applicable law and payment/payout providers. A wire marked sent is not yet confirmed.",
      },
      {
        title: "Third-party content",
        body: "Paid placements and outbound destinations are submitted by users. Their appearance does not mean TakeTheWall endorses the content, organization, individual, or any claim they make. Destination content may change after submission. Report unsafe links through Contact.",
      },
      {
        title: "Limits of cryptographic verification",
        body: "A hash chain links recorded activations and helps detect changes against independently retained checkpoints. External timestamp proofs can support the existence of a checkpoint by a particular time. Neither proves independent fairness of activation ordering, the truth of an advertisement, or a claimant's eligibility.",
      },
      {
        title: "Mandatory rights",
        body: "These explanations do not exclude liability, statutory protections, or remedies that cannot lawfully be excluded. Terms and Reward Rules provide the applicable product conditions.",
      },
    ],
  },
  disclosure: {
    title: "PLACEMENT & REWARD DISCLOSURES",
    intro:
      "The wall contains paid public placements. Here is how purchases, house placements, rewards, and historical pages are presented.",
    sections: [
      {
        title: "Paid placement and house content",
        body: "Each real paid takeover costs $4.99 USD. The seeded VisitorPing placement is a house placement and has no paid takeover number. Moderation restorations are recorded separately and do not increase paid takeover numbers. A paid placement is not an endorsement by TakeTheWall.",
      },
      {
        title: "No reservation at Checkout",
        body: "A permanent number is allocated only when the verified payment activates atomically in Convex. Two people can open Checkout at the same time; whichever activation commits first receives the earlier number. Neither browser timing nor Checkout creation reserves a milestone.",
      },
      {
        title: "Milestone rewards",
        body: "The initial configured milestones are #100, #1,000, #10,000, #100,000 and #1,000,000, with matching gross USD reward amounts when enabled under the Reward Rules. Candidates are provisional. Ineligible or expired claims advance sequentially to the next paid takeover, without random redraw or administrator-selected replacements. Reward creation, payout finalization, and public promotion have separate operational controls.",
      },
      {
        title: "Manual payout and trophy publication",
        body: "Rewards use external manual wire transfers, not Stripe prize disbursement. Approved, sent, and confirmed are separate states. Only confirmed payout publishes the final winner. Applicable withholding and recipient/intermediary bank fees can affect net receipt; the rules and claimant review disclose required deductions. No full bank account details are needed in public audit records.",
      },
      {
        title: "Historical content and statistics",
        body: "Payout confirmation freezes the winning content. If its live reign is still active, statistics remain live. After replacement and the two-minute late-event allowance, those original-reign statistics freeze. Later purchases never overwrite the trophy. Unsafe links may be disabled while the historical trophy stays visible.",
      },
      {
        title: "Full conditions",
        body: "Read Reward Rules for eligibility, worldwide limitations, deadlines, cascades, taxes, refunds/chargebacks, payout and audit details. Terms, Privacy, and Disclaimer explain the wider service. Contact support@takethewall.com with questions before purchasing.",
      },
    ],
  },
};
