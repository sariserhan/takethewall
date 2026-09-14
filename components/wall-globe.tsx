"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useId, useRef, useState } from "react";
import {
  geoArea,
  geoCentroid,
  geoGraticule10,
  geoOrthographic,
  geoPath,
} from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { RegionLabel } from "./region-label";
type Country = Feature<Geometry, { name: string; code: string }>;
const normalize = (code: string) =>
  code.toUpperCase() === "UK" ? "GB" : code.toUpperCase();
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (code: string) =>
  code === "ZZ"
    ? "Unknown location"
    : (countryNames.of(normalize(code)) ?? code);
export function WallGlobe() {
  const report = useQuery(api.websiteGeography.report, {});
  const snapshot = report?.snapshot;
  const regions = snapshot?.countries ?? [];
  const [countries, setCountries] = useState<Country[]>([]),
    [error, setError] = useState(false);
  const [angle, setAngle] = useState(0),
    [tilt, setTilt] = useState(-15),
    [spin, setSpin] = useState(false),
    [selected, setSelected] = useState("");
  const drag = useRef<{ x: number; y: number } | null>(null);
  const gradient = useId();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/maps/countries-110m.json", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json() as Promise<
          FeatureCollection<Geometry, { name: string; code: string }>
        >;
      })
      .then((data) => {
        // D3 spherical polygons use clockwise exterior rings.
        for (const f of data.features) {
          if (geoArea(f) > 2 * Math.PI) {
            if (f.geometry.type === "Polygon")
              f.geometry.coordinates.forEach((r) => r.reverse());
            if (f.geometry.type === "MultiPolygon")
              f.geometry.coordinates.forEach((p) =>
                p.forEach((r) => r.reverse()),
              );
          }
        }
        setCountries(data.features);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!spin) return;
    const id = setInterval(() => {
      if (!document.hidden) setAngle((a) => (a + 0.7) % 360);
    }, 80);
    return () => clearInterval(id);
  }, [spin]);
  const projection = geoOrthographic()
    .scale(177)
    .translate([200, 200])
    .rotate([angle, tilt])
    .clipAngle(90);
  const path = geoPath(projection);
  const counts = new Map(
    regions.map((r) => [normalize(r.countryCode), r.visitors]),
  );
  const sorted = [...regions].sort((a, b) => b.visitors - a.visitors);
  return (
    <section className="globe-view" aria-label="Website visitor geography">
      <div className="globe-summary">
        <span className="eyebrow">
          THE WHOLE WEBSITE · ALL AVAILABLE HISTORY
        </span>
        <h3>Where our visitors come from</h3>
        {snapshot ? (
          <>
            <strong>
              {snapshot.uniqueVisitors.toLocaleString("en-US")} website visitors
            </strong>
            <p>
              {snapshot.from.slice(0, 10)} – {snapshot.to.slice(0, 10)} UTC ·
              VisitorPing’s available {snapshot.historyDays}-day history
            </p>
            <small>
              Updated{" "}
              {new Date(snapshot.fetchedAt)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")}{" "}
              UTC · Refreshes every 30 minutes
            </small>
          </>
        ) : (
          <p role="status">
            {report === undefined
              ? "Loading website geography…"
              : report?.failed
                ? "Website geography is temporarily unavailable. The next refresh will retry."
                : "Website geography is waiting for its first refresh."}
          </p>
        )}
        {snapshot && report?.failed && (
          <p role="status">
            The latest refresh failed. Showing the last successful report.
          </p>
        )}
      </div>
      <svg
        className="earth-globe"
        viewBox="0 0 400 400"
        role="img"
        aria-label="Earth with country borders and website visitor countries"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
          setSpin(false);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x,
            dy = e.clientY - drag.current.y;
          setAngle((a) => (a + dx * 0.5 + 360) % 360);
          setTilt((t) => Math.max(-80, Math.min(80, t - dy * 0.4)));
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <defs>
          <radialGradient id={gradient} cx="35%" cy="30%" r="70%">
            <stop offset="40%" stopColor="#071623" stopOpacity="0" />
            <stop offset="100%" stopColor="#000810" stopOpacity=".65" />
          </radialGradient>
        </defs>
        <circle
          cx="200"
          cy="200"
          r="180"
          fill="#071823"
          stroke="#759fba"
          strokeWidth=".8"
        />
        <path
          d={path(geoGraticule10()) ?? ""}
          fill="none"
          stroke="#1b3643"
          strokeWidth=".5"
        />
        {countries.map((c, i) => (
          <path
            className="earth-country"
            key={i}
            d={path(c) ?? ""}
            fill={counts.has(c.properties.code) ? "#d8ff36" : "#365746"}
            stroke="#88a991"
            strokeWidth=".5"
            onPointerEnter={() => setSelected(c.properties.name)}
          >
            <title>
              {c.properties.name}
              {counts.has(c.properties.code)
                ? ` · ${counts.get(c.properties.code)} visitors`
                : ""}
            </title>
          </path>
        ))}
        <circle
          cx="200"
          cy="200"
          r="177"
          fill={`url(#${gradient})`}
          pointerEvents="none"
        />
      </svg>
      <p className="globe-country-name" aria-live="polite">
        {selected || "Drag Earth to explore countries"}
      </p>
      {error ? (
        <p role="alert">Country map could not load. Reopen Globe to retry.</p>
      ) : !countries.length ? (
        <p>Loading country map…</p>
      ) : null}
      <label>
        Rotate globe
        <input
          type="range"
          min="0"
          max="360"
          value={angle}
          onChange={(e) => {
            setSpin(false);
            setAngle(Number(e.target.value));
          }}
        />
      </label>
      <button onClick={() => setSpin((s) => !s)}>
        {spin ? "Pause rotation" : "Rotate automatically"}
      </button>
      <p>
        Highlighted countries show website visitors across all wall owners.
        These are historical country totals, not live locations.
      </p>
      {sorted.length ? (
        <ul className="globe-country-list" aria-label="Visitors by country">
          {sorted.map((r) => (
            <li key={r.countryCode}>
              <button
                onClick={() => {
                  const country = countries.find(
                    (c) => c.properties.code === normalize(r.countryCode),
                  );
                  if (country) {
                    const [lon, lat] = geoCentroid(country);
                    setSpin(false);
                    setAngle((360 - lon) % 360);
                    setTilt(-lat);
                    setSelected(country.properties.name);
                  }
                }}
              >
                <span>
                  <RegionLabel code={r.countryCode} />{" "}
                  {countryName(r.countryCode)}
                </span>
                <strong>{r.visitors.toLocaleString("en-US")} visitors</strong>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No country analytics yet. Explore the map while the first visits
          arrive.
        </p>
      )}
      {snapshot?.truncated && (
        <p>Showing the top 100 country groups supplied by VisitorPing.</p>
      )}
      <p className="field-note">
        City data is not available from VisitorPing’s current API. A visitor can
        appear in more than one country; country counts are not added together
        to produce the website total.
      </p>
      <small>
        Source:{" "}
        <a
          href="https://visitorping.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          VisitorPing
        </a>{" "}
        · Known and likely bots excluded. Map: Natural Earth.
      </small>
    </section>
  );
}
