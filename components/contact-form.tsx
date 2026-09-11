"use client";
import Link from "next/link";
import { useState } from "react";
export function ContactForm() {
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const form = e.currentTarget;
        const data = new FormData(form);
        try {
          const r = await fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(data)),
          });
          const body = await r.json();
          if (!r.ok)
            throw new Error(body.error ?? "Could not send your message");
          setStatus(
            "Your message is with TakeTheWall Support. We will reply by email.",
          );
          form.reset();
        } catch (e) {
          setStatus(e instanceof Error ? e.message : "Message failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Name (optional)
        <input name="name" maxLength={100} autoComplete="name" />
      </label>
      <label>
        Email
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
        />
      </label>
      <label>
        Topic
        <select name="topic">
          {[
            "General question",
            "Payment issue",
            "Wall issue",
            "Milestone reward",
            "Report content",
            "Technical problem",
            "Business inquiry",
            "Other",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Message
        <textarea name="message" required maxLength={10000} rows={8} />
      </label>
      <div className="honeypot" aria-hidden="true">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <p>
        Do not include passwords, claim links, payment-card details, or identity
        documents. See our <Link href="/privacy">Privacy Notice</Link>.
      </p>
      <button disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
      <p role="status">{status}</p>
    </form>
  );
}
