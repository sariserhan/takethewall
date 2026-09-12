"use client";
import { useEffect, useState } from "react";
export function AlertManagement() {
  const [link, setLink] = useState<{ action: string; token: string } | null>(
      null,
    ),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => {
    const readFragment = () => {
      const p = new URLSearchParams(location.hash.slice(1));
      const action = p.has("confirm") ? "confirm" : "unsubscribe",
        token = p.get(action);
      if (!token) return;
      history.replaceState(null, "", location.pathname);
      setLink({ action, token });
      setDone(false);
      setNotice("");
    };
    readFragment();
    window.addEventListener("hashchange", readFragment);
    return () => window.removeEventListener("hashchange", readFragment);
  }, []);
  return (
    <section>
      <h1>
        {link?.action === "confirm"
          ? "Confirm milestone alerts"
          : "Milestone email preferences"}
      </h1>
      {link ? (
        <>
          <p>
            {link.action === "confirm"
              ? "Receive one email when a future milestone is within 10 counted takeovers. This does not reserve a number or guarantee a prize."
              : "Stop future milestone alerts. Your owner dashboard emails are unaffected."}
          </p>
          <button
            className="button"
            disabled={busy || done}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await fetch("/api/alerts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(link),
                });
                const data = await r.json();
                if (!r.ok) throw Error(data.error);
                setDone(true);
                setNotice(
                  link.action === "confirm"
                    ? "Your milestone alerts are confirmed."
                    : "You have unsubscribed from milestone alerts.",
                );
              } catch (e) {
                setNotice(e instanceof Error ? e.message : "Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {link.action === "confirm"
              ? "Confirm my subscription"
              : "Unsubscribe from milestone alerts"}
          </button>
        </>
      ) : (
        <p>Open the confirmation or unsubscribe link from your email.</p>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
