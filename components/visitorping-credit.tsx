import styles from "./visitorping-credit.module.css";

export function VisitorPingCredit({ map }: { map?: "countries" | "cities" }) {
  return (
    <div className={styles.credit}>
      <a className={styles.brand} href="https://visitorping.com/" target="_blank" rel="noopener noreferrer">
        Powered by <strong>VisitorPing</strong> <span aria-hidden="true">↗</span>
      </a>
      <span className={styles.caption}>Discover where your audience comes from.</span>
      {map && (
        <details className={styles.details}>
          <summary>Map credits</summary>
          <p>
            {map === "cities" && <>Approximate city centers: <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>), reduced and rounded. </>}
            Country outlines: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a>. Map positions are approximate, never precise visitor coordinates.
          </p>
        </details>
      )}
    </div>
  );
}
