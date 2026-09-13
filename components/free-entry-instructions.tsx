import Link from "next/link";
const emailUrl =
  "mailto:contact@takethewall.com?" +
  new URLSearchParams({
    subject: "Free wall entry",
    body: "Name: \nEmail address: \nPublic display name: \nAd text (up to 120 characters) or URL: \n",
  })
    .toString()
    .replaceAll("+", "%20");
export function FreeEntryInstructions() {
  return (
    <section className="free-entry-instructions">
      <p>
        <strong>No purchase necessary.</strong> Submit a free wall entry by
        email. Eligibility and claim requirements are explained in the Reward
        Rules.
      </p>
      <p>
        Send to{" "}
        <a href="mailto:contact@takethewall.com">contact@takethewall.com</a>
        <br />
        Subject: <strong>Free wall entry</strong>
      </p>
      <h3>Include in your email</h3>
      <ul>
        <li>Your name and email address</li>
        <li>Your public display name</li>
        <li>Your desired ad text (up to 120 characters) or URL</li>
      </ul>
      <p>Do not email identity documents.</p>
      <a className="button" href={emailUrl}>
        Email my free entry ↗
      </a>
      <p className="field-note">
        Opens your email app with a template. You must send the email to submit
        your entry.
      </p>
      <h3>What happens next?</h3>
      <p>
        Entries are reviewed manually in received order for content and
        eligibility. Each valid entry receives a placement and the next
        available counted number when processed. Sending an email does not
        reserve a number; paid takeovers may activate while an entry awaits
        review.
      </p>
      <p>
        Valid free entries use the same reward criteria, referral tracking, and
        claim requirements as paid placements. Contact us at the address above
        if you have not received confirmation.
      </p>
      <Link href="/?info=rewards">Read the Reward Rules →</Link>
    </section>
  );
}
