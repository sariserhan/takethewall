"use client";
import { useState } from "react";
import { Dialog } from "./dialog";
const reasons = [
  "Scam or phishing",
  "Malware or unsafe link",
  "Hateful or abusive content",
  "Sexual or violent content",
  "Impersonation or rights violation",
  "Other policy issue",
];
export function ReportContent({
  takeoverId,
  name,
}: {
  takeoverId: string;
  name: string;
}) {
  const [target, setTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [reason, setReason] = useState(reasons[0]);
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className="report-content-trigger"
        onClick={() => {
          setTarget({ id: takeoverId, name });
          setSent(false);
          setMessage("");
        }}
      >
        Report this content
      </button>
      <Dialog
        open={!!target}
        onClose={() => setTarget(null)}
        title="REPORT CONTENT"
      >
        {sent ? (
          <p role="status">
            Report received. Our team will review this placement. Thank you for
            helping keep the wall safe.
          </p>
        ) : (
          <form
            className="report-content-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!target || busy) return;
              setBusy(true);
              setMessage("");
              try {
                const response = await fetch("/api/report", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    takeoverId: target.id,
                    reason,
                    details,
                    email,
                    company: new FormData(e.currentTarget).get("company"),
                  }),
                });
                const data = await response.json();
                if (!response.ok)
                  throw Error(data.error ?? "Could not submit report.");
                setSent(true);
                setDetails("");
                setEmail("");
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : "Could not submit report.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              You are reporting <strong>{target?.name}</strong>. The report
              stays attached to this placement even if the live owner changes.
            </p>
            <label>
              Reason
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {reasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              What should we review?
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </label>
            <label>
              Email for follow-up (optional)
              <input
                type="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="honeypot" aria-hidden="true">
              Company
              <input name="company" tabIndex={-1} autoComplete="off" />
            </label>
            {message && <p role="alert">{message}</p>}
            <button type="submit" className="button" disabled={busy}>
              {busy ? "Sending…" : "Submit report"}
            </button>
          </form>
        )}
      </Dialog>
    </>
  );
}
