"use client";
import { Dialog } from "./dialog";
export type LegalPage = "Terms" | "Privacy" | "Content policy";
export function Legal({
  page,
  onClose,
}: {
  page: LegalPage | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!page} title={page ?? "Legal"} onClose={onClose}>
      <div className="legal-copy">
        {page === "Terms" ? (
          <>
            <p>
              One successfully verified $2.99 USD purchase activates your
              advertisement. The next successfully activated purchase replaces
              it immediately. There is no minimum or maximum ownership duration.
            </p>
            <p>
              This is a playful internet advertising experiment. No audience,
              impressions, clicks, geographic distribution, conversions, or
              advertising results are promised. A reign may last only a second.
            </p>
            <p>
              No refund is offered because a reign was short, traffic or clicks
              were low, someone replaced you, or you changed your mind. Contact
              support for duplicate charges, a paid takeover that never
              activated because of a system failure, or fraud and processor
              requirements. Any rights that cannot be excluded by applicable law
              remain in effect.
            </p>
            <p>
              You must have permission to use the submitted logo and content.
              You grant permission to display and store your ad. Policy
              violations may be removed. A moderation restoration is recorded
              separately from a paid purchase.
            </p>
            <p>
              Questions about a purchase: support@takethewall.com. Keep your
              Stripe receipt; never send card details.
            </p>
          </>
        ) : page === "Privacy" ? (
          <>
            <p>
              No account is created. Your email is private and used only for
              purchase receipts, activation, replacement, and necessary support
              messages. Purchase is not consent to marketing. Stripe handles
              card information; we do not store card numbers.
            </p>
            <p>
              Convex stores your ad and purchase records. Resend delivers
              transactional notices. VisitorPing receives sanitized events with
              public ad details and anonymous identifiers, never buyer emails,
              Stripe identifiers, or confirmation tokens.
            </p>
            <p>
              We use a first-party browser identifier to estimate lifetime,
              daily UTC, and reign visitors. It is hashed before storage.
              Different browsers or clearing storage can count as another
              visitor. Country is inferred from trusted hosting metadata. Bot
              filtering is best effort.
            </p>
            <p>
              Your form draft stays in this tab’s session storage so
              cancellation preserves it. It is removed after payment
              confirmation or when the tab closes. Status tokens expire after 48
              hours. Unreferenced uploads are removed after a 48-hour grace
              period. Historical ad assets and aggregate reign data remain
              available for operations.
            </p>
            <p>
              Unpaid contact data is deleted after 30 days. Paid email contact
              data is deleted after one year, or after an active reign ends if
              longer. Payment references are retained only for necessary payment
              operations and applicable recordkeeping obligations. Anonymous
              lifetime and reign deduplication records support the published
              counts; short-lived event and rate records are routinely deleted.
            </p>
            <p>
              Request contact deletion or ask about your data at
              privacy@takethewall.com. Necessary payment records may be retained
              where required. Please supply a receipt reference, never card
              details.
            </p>
          </>
        ) : (
          <>
            <p>
              Do not submit phishing, malware, fraud, impersonation, illegal
              goods or services, explicit pornography, extremist or terrorist
              promotion, or sites designed to steal credentials.
            </p>
            <p>
              Submit only a public HTTPS website, a logo you have permission to
              use, and a plain-text description of up to 120 characters. No
              scripts, HTML, SVG uploads, or embedded pages.
            </p>
            <p>
              We can remove a harmful ad. Removal ends that reign and starts a
              new moderation reign using a valid earlier creative or the safe
              house ad. Historical paid reigns are preserved.
            </p>
            <p>
              Report a harmful advertisement to support@takethewall.com with its
              domain and the reason.
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}
