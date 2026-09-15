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

export function LiveVisitorRadar({ visitors, connected }: {
  visitors?: LiveVisitor[];
  connected: boolean;
}) {
  const ready = connected && visitors !== undefined;
  const rows = ready ? visitors : [];
  return (
    <section className={styles.radar} aria-label="Live visitor radar">
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
                <div key={visitor.id} role="listitem" className={styles.contact}
                  style={{
                    "--start-x": `${50 + Math.cos(angle) * 39}%`,
                    "--start-y": `${50 + Math.sin(angle) * 39}%`,
                    "--end-x": `${50 + Math.cos(angle) * 10}%`,
                    "--end-y": `${50 + Math.sin(angle) * 10}%`,
                  } as CSSProperties}>
                  <button type="button" className={styles.dot} aria-label={label} title={label}>
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
        <span>Each dot is a visitor with the wall visible. Tap or click the page to enable arrival pings.</span>
        <span>Dots drift inward during a visit. Position is decorative; city and country are approximate.</span>
      </footer>
    </section>
  );
}
