"use client";
import { useEffect, useState } from "react";
export function OwnerUnsubscribe() {
  const [token, setToken] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => {
    const t = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
    history.replaceState(null, "", location.pathname); // eslint-disable-next-line react-hooks/set-state-in-effect -- Read a browser-only email fragment after hydration.
    setToken(t);
  }, []);
  return (
    <section className="owner-access-form">
      <h1>
        YOUR INBOX.
        <br />
        YOUR CHOICE.
      </h1>
      <p>
        Stop weekly summaries for this takeover. Activation, replacement, and
        reward notices are unaffected.
      </p>
      <button
        className="button"
        disabled={!token || busy || done}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/owner/unsubscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token }),
            });
            if (!r.ok)
              throw Error(
                "This unsubscribe link is invalid. Use your owner dashboard to change preferences.",
              );
            setMessage("You are unsubscribed from weekly summaries.");
            setDone(true);
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Saving…"
          : done
            ? "Unsubscribed"
            : "Unsubscribe from weekly summaries"}
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
