"use client";
import { useEffect, useState } from "react";
export function WallEmailManagement() {
  const [link, setLink] = useState<{ action: string; token: string } | null>(
      null,
    ),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [frequency, setFrequency] = useState("daily");
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(location.hash.slice(1));
      const action = p.has("confirm") ? "confirm" : "unsubscribe",
        token = p.get(action);
      if (token) {
        history.replaceState(null, "", location.pathname);
        setLink({ action, token });
        setDone(false);
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  async function submit(action: string) {
    if (!link) return;
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/wall-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...link,
          action,
          ...(action === "frequency" ? { frequency } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setDone(action !== "frequency");
      setNotice(
        action === "confirm"
          ? "Your wall-change subscription is confirmed."
          : action === "frequency"
            ? "Email frequency updated."
            : "You have unsubscribed from wall-change emails.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h1>
        {link?.action === "confirm"
          ? "Confirm wall-change emails"
          : "Wall email preferences"}
      </h1>
      {link ? (
        <>
          <p>
            Wall-change emails are separate from milestone alerts and owner
            reports.
          </p>
          {link.action !== "confirm" && !done && (
            <>
              <label>
                Email frequency
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                >
                  <option value="daily">Daily summary · 09:00 UTC</option>
                  <option value="every">Every takeover</option>
                </select>
              </label>
              <button disabled={busy} onClick={() => void submit("frequency")}>
                Save frequency
              </button>
            </>
          )}
          <button
            className="button"
            disabled={busy || done}
            onClick={() => void submit(link.action)}
          >
            {link.action === "confirm"
              ? "Confirm my subscription"
              : "Unsubscribe from wall-change emails"}
          </button>
        </>
      ) : (
        <p>Open the confirmation or preferences link from your email.</p>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
