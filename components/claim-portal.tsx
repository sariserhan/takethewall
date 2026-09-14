"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BackendProvider } from "./backend-provider";
export function ClaimEntry({ token }: { token: string }) {
  const [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function request(action: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, token, code }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Unable to verify");
      if (action === "verify") window.location.replace("/reward/portal");
      else {
        setSent(true);
        setMessage(
          "If this link is valid, a fresh code is on its way to the purchase email.",
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h1>CLAIM YOUR REWARD</h1>
      <p>
        Verify access using a fresh code sent to your purchase email. No account
        required.
      </p>
      <button disabled={busy} onClick={() => void request("start")}>
        {sent ? "Send a fresh code" : "Email verification code"}
      </button>
      {sent && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void request("verify");
          }}
        >
          <label>
            Six-digit code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button disabled={busy}>Verify and open claim</button>
        </form>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
export function ClaimPortal() {
  const [session, setSession] = useState<string | null | undefined>();
  useEffect(() => {
    void fetch("/api/claim", { cache: "no-store" })
      .then((r) => r.json())
      .then((r) => setSession(r.session ?? null))
      .catch(() => setSession(null));
  }, []);
  return session === undefined ? (
    <p>Checking claim session…</p>
  ) : session ? (
    <BackendProvider>
      <Portal session={session} />
    </BackendProvider>
  ) : (
    <section>
      <h1>SIGN IN TO YOUR CLAIM</h1>
      <p>
        Open your protected email link to request a fresh verification code.
        Contact support if you need a replacement link.
      </p>
    </section>
  );
}
function Portal({ session }: { session: string }) {
  const data = useQuery(api.rewards.portal, { session });
  const submit = useMutation(api.rewards.submit),
    send = useMutation(api.rewards.send),
    read = useMutation(api.rewards.read);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (document.visibilityState === "visible") void read({ session });
    const onVisible = () => {
      if (document.visibilityState === "visible") void read({ session });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session, read, data?.messages.length]);
  if (!data) return <p>Loading your reward…</p>;
  return (
    <>
      <p className="eyebrow">
        MILESTONE #{data.milestone} ·{" "}
        {data.rewardKind === "performance_traffic"
          ? "REFERRAL LEADER"
          : "MILESTONE PLACEMENT"}
      </p>
      <h1>${data.amount.toLocaleString("en-US")} REWARD</h1>
      <p>
        Takeover #{data.number} ·{" "}
        {data.status.replaceAll("_", " ").toUpperCase()}
      </p>
      <p>
        {data.status === "under_review"
          ? "Your submission is under review. Review time does not count against your deadline."
          : `Submission deadline: ${new Date(data.deadlineAt).toUTCString()}`}
      </p>
      <p>Payout: {data.payoutStatus}</p>
      <p>
        <Link
          href={`/${data.milestone}${data.rewardKind === "performance_traffic" ? "/referral" : ""}`}
        >
          View your public reward page →
        </Link>
      </p>
      <h2>Claim checklist</h2>
      <ul>
        {data.requiredActions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
      <button
        onClick={async () => {
          await fetch("/api/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "logout" }),
          });
          window.location.reload();
        }}
      >
        Sign out of claim
      </button>
      <h2>CLAIM CHECKLIST</h2>
      {data.requiredInformation && (
        <p className="notice">{data.requiredInformation}</p>
      )}
      {[
        "code_verified",
        "pending_claim",
        "information_required",
        "additional_information_required",
      ].includes(data.status) && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await submit({
                session,
                legalName: String(f.get("legalName")),
                country: String(f.get("country")),
                region: String(f.get("region")),
                dob: String(f.get("dob")),
                declaration: String(f.get("declaration")),
                acceptRules: f.get("accept") === "on",
              });
              setError("Information submitted.");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Submission failed");
            }
          }}
        >
          <label>
            Legal name
            <input
              name="legalName"
              required
              maxLength={200}
              defaultValue={data.legalName}
            />
          </label>
          <label>
            Country of residence (two-letter code)
            <input
              name="country"
              required
              maxLength={2}
              defaultValue={data.country}
              placeholder="US"
            />
          </label>
          <label>
            State / province / region
            <input name="region" maxLength={100} defaultValue={data.region} />
          </label>
          <label>
            Date of birth
            <input name="dob" type="date" required defaultValue={data.dob} />
          </label>
          <label>
            Requested additional information (do not enter bank account numbers)
            <textarea name="declaration" maxLength={5000} />
          </label>
          <label className="check-label">
            <input name="accept" type="checkbox" required />
            <span className="check-copy">
              I confirm the information is accurate and accept{" "}
              <a
                href={`/rewards?version=${encodeURIComponent(data.rulesVersion)}`}
                target="_blank"
                rel="noreferrer"
              >
                Reward Rules {data.rulesVersion}
              </a>
              .
            </span>
          </label>
          <button>Submit for review</button>
        </form>
      )}
      {data.documents.map((d) => (
        <article key={d.id}>
          <p>
            {d.request} · {d.uploaded ? "Uploaded" : "Required"}
          </p>
          {d.uploaded ? (
            <a
              href={`/api/documents?id=${d.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Download privately
            </a>
          ) : (
            <input
              aria-label={`Upload ${d.request}`}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) {
                  setError("Documents must be 10 MB or smaller");
                  return;
                }
                const transfer = await fetch(
                  `/api/documents?id=${d.id}&upload=1`,
                  { cache: "no-store" },
                ).then((r) => r.json());
                const r = await fetch(transfer.url, {
                  method: "POST",
                  headers: { ...transfer.headers, "Content-Type": file.type },
                  body: file,
                });
                setError(
                  r.ok ? "Document uploaded." : "Document upload failed.",
                );
              }}
            />
          )}
        </article>
      ))}
      <h2>MESSAGES WITH TAKETHEWALL</h2>
      <div className="messages">
        {data.messages.map((m) => (
          <article key={m.id}>
            <strong>{m.sender}</strong>
            <small>{new Date(m.createdAt).toLocaleString()}</small>
            <p>{m.body}</p>
          </article>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await send({ session, body: message });
            setMessage("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Message failed");
          }
        }}
      >
        <label>
          Message
          <textarea
            required
            maxLength={5000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <button>Send message</button>
      </form>
      <p role="status">{error}</p>
    </>
  );
}
