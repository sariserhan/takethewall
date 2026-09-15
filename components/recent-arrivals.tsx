"use client";

import { useEffect, useRef, useState } from "react";
import { visitorLabel, type LiveVisitor } from "./live-visitor-radar";
import styles from "./recent-arrivals.module.css";

type Arrival = LiveVisitor & { observedAt: number; arrival: boolean };

export function RecentArrivals({ visitors, connected, selected, onSelect }: {
  visitors?: LiveVisitor[];
  connected: boolean;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const [entries, setEntries] = useState<Arrival[]>([]);
  const [now, setNow] = useState(0);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!connected || !visitors) {
      seen.current = null;
      return;
    }
    // Coalesce live snapshots before updating the activity list for the next frame.
    const frame = requestAnimationFrame(() => {
      const previous = seen.current;
      seen.current = new Set(visitors.map(visitor => visitor.id));
      const observedAt = Date.now();
      const fresh = visitors.filter(visitor => !previous?.has(visitor.id));
      setNow(observedAt);
      setEntries(current => {
        // Reconnect snapshots must not move known visitors to the top again.
        const additions = fresh.filter(visitor => previous || !current.some(entry => entry.id === visitor.id));
        const ids = new Set(additions.map(visitor => visitor.id));
        return [
          ...additions.map(visitor => ({ ...visitor, observedAt, arrival: previous !== null })),
          ...current.filter(entry => !ids.has(entry.id)).map(entry => ({ ...entry, ...visitors.find(visitor => visitor.id === entry.id) })),
        ].slice(0, 5);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [visitors, connected]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const ready = connected && visitors !== undefined;
  const online = new Set(ready ? visitors.map(visitor => visitor.id) : []);
  return (
    <section className={styles.panel} aria-label="Recent arrivals">
      <header className={styles.header}>
        <h3>Recent arrivals</h3>
        <span>{ready ? "LIVE ACTIVITY" : "CONNECTING"}</span>
      </header>
      {entries.length ? (
        <ol className={styles.list}>
          {entries.map(entry => {
            const minutes = Math.max(0, Math.floor((now - entry.observedAt) / 60_000));
            const age = minutes < 1 ? "just now" : minutes < 60
              ? `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`
              : `${Math.floor(minutes / 60)} ${minutes < 120 ? "hour" : "hours"} ago`;
            const active = online.has(entry.id);
            return (
              <li key={entry.id} data-selected={active && selected === entry.id}>
                <button className={styles.row} type="button" disabled={!active} aria-pressed={active && selected === entry.id}
                  aria-label={`${visitorLabel(entry)}${active ? ", highlight on radar" : ", no longer online"}`}
                  onMouseEnter={() => { if (active) onSelect?.(entry.id); }} onMouseLeave={() => onSelect?.(null)}
                  onFocus={() => onSelect?.(entry.id)} onBlur={() => onSelect?.(null)} onClick={() => onSelect?.(entry.id)}>
                <i className={styles.indicator} data-online={active} aria-label={!ready ? "Status unavailable" : active ? "Online now" : "No longer online"} role="img" />
                <span className={styles.location}>
                  <strong>{visitorLabel(entry)}</strong>
                  <time dateTime={new Date(entry.observedAt).toISOString()}>
                    {entry.arrival ? "Arrived" : "First seen"} {age}
                  </time>
                </span>
                <span className={styles.status}>{!ready ? "—" : active ? "ONLINE" : "LEFT"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : <p className={styles.empty}>{ready ? "Listening for the next arrival…" : "Connecting to live arrivals…"}</p>}
      <p className={styles.note}>Latest five visitors seen while this page is open. Green means online; entries remain after visitors leave.</p>
    </section>
  );
}
