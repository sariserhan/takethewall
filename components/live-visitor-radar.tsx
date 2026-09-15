import { VisitorPingCredit } from "./visitorping-credit";
import { useVisibleAnimation } from "./use-visible-animation";
import type { CSSProperties } from "react";
import styles from "./live-visitor-radar.module.css";

export type LiveVisitor = { id: string; city: string; country: string };
const countries = new Intl.DisplayNames(["en"], { type: "region" });
export function visitorLocation(visitor: LiveVisitor) {
  const code = visitor.country.trim().toUpperCase();
  const country = /^[A-Z]{2}$/.test(code) && code !== "ZZ"
    ? countries.of(code) : code === "ZZ" ? "" : visitor.country;
  return [visitor.city.trim(), country].filter(Boolean).join(", ") || "Location unavailable";
}
function bearing(id: string) {
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return ((hash >>> 0) % 360) * Math.PI / 180;
}

export function LiveVisitorRadar({ visitors, connected, selected, onSelect }: {
  visitors?: LiveVisitor[];
  connected: boolean;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const animation = useVisibleAnimation();
  const ready = connected && visitors !== undefined;
  const rows = ready ? visitors : [];
  return (
    <section ref={animation} className={styles.radar} aria-label="Live visitor radar">
      <header className={styles.header}>
        <span><i aria-hidden="true" /> LIVE VISITOR RADAR</span>
        <strong>{ready ? `${rows.length}${rows.length === 500 ? "+" : ""} ONLINE` : "CONNECTING"}</strong>
      </header>
      <div className={styles.screen}>
        <div className={styles.scope}>
          <div className={styles.grid} aria-hidden="true" />
          <div className={styles.sweep} aria-hidden="true" />
          <span className={styles.center} aria-hidden="true">+</span>
          <span className={styles.north} aria-hidden="true">N / 000</span>
          <div className={styles.contacts} role="list" aria-label="Visitors with the wall visible">
            {rows.map(visitor => {
              const angle = bearing(visitor.id);
              const label = visitorLocation(visitor);
              return (
                <div key={visitor.id} role="listitem" className={styles.contact} data-selected={selected === visitor.id}
                  style={{
                    "--start-x": `${Math.cos(angle) * 39}cqw`,
                    "--start-y": `${Math.sin(angle) * 39}cqw`,
                    "--end-x": `${Math.cos(angle) * 10}cqw`,
                    "--end-y": `${Math.sin(angle) * 10}cqw`,
                  } as CSSProperties}>
                  <button type="button" className={styles.dot} aria-label={label} title={label} aria-pressed={selected === visitor.id}
                    onMouseEnter={() => onSelect?.(visitor.id)} onMouseLeave={() => onSelect?.(null)}
                    onFocus={() => onSelect?.(visitor.id)} onBlur={() => onSelect?.(null)} onClick={() => onSelect?.(visitor.id)}>
                    <span className={styles.label} data-side={Math.cos(angle) > 0 ? "left" : "right"}>{label}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        {ready && !rows.length && <p className={styles.empty}>SCANNING · WAITING FOR VISITORS</p>}
      </div>
      <footer className={styles.footer}>
        <span>Each dot is a visitor with the wall visible. Use Sound on/off to control arrival pings; tap or click once to enable audio.</span>
        <span>Dots drift inward during a visit. Position is decorative; city and country are approximate.</span>
        <VisitorPingCredit />
      </footer>
    </section>
  );
}
