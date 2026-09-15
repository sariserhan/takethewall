"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexConnectionState, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { geoArea, geoCentroid, geoEquirectangular, geoPath } from "d3-geo";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import { cityLookup, type CityCenter } from "@/lib/radar-geography";
import styles from "./wall-radar.module.css";
type Country = Feature<Geometry, { name: string; code: string }>;
type Arrival = {
  id: string;
  receivedAt: number;
  city: string;
  country: string;
  views?: number;
  label?: string;
};
const place = (row: Arrival) =>
  row.label || [row.city, row.country].filter(Boolean).join(", ") || "Location unavailable";
export function WallRadar({ scope = "today" }: { scope?: "today" | "takeover" }) {
  const takeover = scope === "takeover";
  const live = useQuery(api.wallPresence.live, takeover ? "skip" : {});
  const [requestedMode, setMode] = useState<"cities" | "live">("cities");
  const wall = useQuery(api.wall.current, {});
  const today = new Date().toISOString().slice(0, 10);
  const report = takeover ? wall?.takeoverRadarCities : wall?.radarCities ? wall.utcDate === today ? wall.radarCities : { date: today, views: 0, uniqueVisitors: 0, historicalThrough: null, cities: [] } : null;
  const mode = takeover ? "cities" : report ? requestedMode : "live";
  const connection = useConvexConnectionState();
  const [countries, setCountries] = useState<Country[]>([]),
    [cities, setCities] = useState<CityCenter[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [flashes, setFlashes] = useState<string[]>([]),
    [selected, setSelected] = useState("");
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const liveReady = live !== undefined && connection.isWebSocketConnected;
  const rows: Arrival[] = mode === "cities"
    ? (report?.cities ?? []).map(city => ({ id: "city:" + city.label, receivedAt: 0, city: city.city, country: city.country, views: city.views, label: city.label }))
    : liveReady ? live : [];
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const results = await Promise.allSettled([
        fetch("/maps/countries-110m.json", { signal: controller.signal }).then(
          (r) => {
            if (!r.ok) throw Error();
            return r.json() as Promise<
              FeatureCollection<Geometry, { name: string; code: string }>
            >;
          },
        ),
        fetch("/maps/cities-15000.json", { signal: controller.signal }).then(
          (r) => {
            if (!r.ok) throw Error();
            return r.json() as Promise<CityCenter[]>;
          },
        ),
      ]);
      if (controller.signal.aborted) return;
      if (results[0].status === "fulfilled") {
        const features = results[0].value.features;
        for (const f of features)
          if (geoArea(f) > 2 * Math.PI) {
            if (f.geometry.type === "Polygon")
              f.geometry.coordinates.forEach((r) => r.reverse());
            if (f.geometry.type === "MultiPolygon")
              f.geometry.coordinates.forEach((p) =>
                p.forEach((r) => r.reverse()),
              );
          }
        setCountries(features);
      }
      if (results[1].status === "fulfilled") setCities(results[1].value);
      setMapReady(true);
    }
    void load();
    return () => controller.abort();
  }, []);
  const lookup = useMemo(() => cityLookup(cities), [cities]);
  const projection = geoEquirectangular()
    .scale(600 / (2 * Math.PI))
    .translate([320, 170]);
  const path = geoPath(projection);
  const mapped = rows.map((row) => {
    const code = lookup.countryCode(row.country);
    const country = countries.find(
      (f) =>
        f.properties.code === code ||
        f.properties.name.toLowerCase() === row.country.toLowerCase(),
    );
    const city = lookup.find(row.city, row.country);
    const coordinates = city ?? (country ? geoCentroid(country) : null);
    return {
      row,
      point: coordinates ? projection(coordinates) : null,
      precision: city
        ? "Approximate city center"
        : coordinates
          ? "Country center · city not resolved"
          : "Location not mapped",
    };
  });
  useEffect(() => {
    if (!live) return;
    const previous = seen.current;
    seen.current = new Set(live.map((row) => row.id));
    if (
      !previous ||
      document.hidden ||
      document.documentElement.dataset.wallFrozen === "on"
    )
      return;
    const fresh = live
      .filter(
        (row) =>
          !previous.has(row.id) &&
          Date.now() - row.receivedAt >= 0 &&
          Date.now() - row.receivedAt < 15000,
      )
      .map((row) => row.id);
    if (!fresh.length) return;
    setFlashes(fresh);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashes([]), 6000);
  }, [live]);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );
  const latest = rows.find(row => row.id === selected) ?? rows[0];
  return (
    <section
      className={styles.radar}
      aria-label={mode === "cities" ? takeover ? "Views by city this takeover" : "Visits by city today" : "Visitors online now"}
      data-testid="radar"
    >
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>{mode === "cities" ? takeover ? "RADAR · THIS TAKEOVER" : "RADAR · VISITS BY CITY" : "RADAR · ONLINE NOW"}</span>
          <h2>The world, dropping by.</h2>
          <p>{mode === "cities" ? takeover ? "Every counted view during this takeover, grouped by city. Includes repeat visits and resets with the next owner." : "Today’s visits grouped by city, including repeat views. Totals match the wall’s daily view counter." : "Visitors with the wall visible right now, counted once per browser."}</p>
        </div>
        <span className={styles.status}>
          {mode === "cities" ? "LIVE CITY TOTALS" : connection.isWebSocketConnected
              ? "LISTENING"
              : "RECONNECTING"}
        </span>
      </header>
      <div className={styles.controls}>
        {report && <button aria-pressed={mode === "cities"} onClick={() => { setMode("cities"); setSelected(""); }}>Cities</button>}
        {!takeover && <button aria-pressed={mode === "live"} onClick={() => { setMode("live"); setSelected(""); }}>Live visitors</button>}
        <span>
          {mode === "cities" ? report ? takeover ? `${report.views} views · this takeover` : `${report.views} visits · ${report.uniqueVisitors} unique visitors · today (UTC)` : "Loading cities…" : !liveReady ? "Connecting…" : `${rows.length}${rows.length === 500 ? "+" : ""} ${rows.length === 1 ? "visitor" : "visitors"} online now`}
        </span>
      </div>
      <p className={styles.note}>
        Arrival sound is enabled across the wall, even when Radar is closed.
        Click or tap anywhere first to allow audio.
      </p>
      <div className={styles.layout}>
        <div className={styles.visual}>
          <svg
            viewBox="0 0 640 340"
            role="img"
            aria-label="Approximate arrival locations on a world map"
          >
            <defs>
              <pattern
                id="radar-grid"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M40 0H0V40"
                  fill="none"
                  stroke="#19352b"
                  strokeWidth=".6"
                />
              </pattern>
            </defs>
            <rect width="640" height="340" fill="url(#radar-grid)" />
            {countries.map((f) => (
              <path
                key={f.properties.name}
                d={path(f) ?? undefined}
                fill="#112b22"
                stroke="#47795b"
                strokeWidth=".5"
              />
            ))}
            {mapped
              .filter((item) => item.point)
              .slice()
              .reverse()
              .map(({ row, point, precision }) => (
                <g
                  key={row.id}
                  transform={`translate(${point![0]},${point![1]})`}
                  data-arrival-id={row.id}
                  className={
                    flashes.includes(row.id) ? styles.fresh : undefined
                  }
                >
                  <title>
                    {place(row)} · {precision}
                  </title>
                  {flashes.includes(row.id) && (
                    <circle
                      className={styles.ring}
                      r="6"
                      fill="none"
                      stroke="#d8ff36"
                    />
                  )}
                  <circle
                    r={selected === row.id ? 6 : 3.5}
                    fill={selected === row.id ? "#ffffff" : "#d8ff36"}
                    stroke="#071510"
                  />
                </g>
              ))}
          </svg>
          <div className={styles.caption}>
            {latest ? (
              <>
                <strong>{place(latest)}</strong>
                <span>
                  {mode === "cities" ? `${latest.views} ${latest.views === 1 ? "view" : "views"} ${takeover ? "this takeover" : "today"}` : "On the wall now"}
                </span>
              </>
            ) : (
              <>
                <strong>
                  {mode === "cities" ? report ? takeover ? "No views during this takeover yet." : "No wall visits in today’s city report." : "Loading city report…" : !liveReady
                    ? "Connecting to arrivals…"
                    : !liveReady ? "Connecting to live visitors…" : "No visitors online right now."}
                </strong>
                <span>
                  {mode === "cities" ? "Each accepted wall view counts once, even when both tracking sources report it." : "Visitors appear while they have the wall open and visible."}
                </span>
              </>
            )}
          </div>
          {mapReady && !countries.length && (
            <p>
              Map unavailable. Arrival details remain available in the feed.
            </p>
          )}
          <p className={styles.note}>
            Pins show approximate city centers. Unresolved cities fall back to a
            labeled country center; unknown locations stay in the feed.
          </p>
        </div>
        <div className={styles.feed}>
          <h3>{mode === "cities" ? "Visits by city" : "Online now"}</h3>
          {!rows.length ? (
            <p>
              {mode === "cities" ? report ? takeover ? "No cities recorded for this takeover yet." : "No cities recorded yet today." : "City totals are loading." : !liveReady ? "Connecting to live visitors…" : "No visitors online right now."}
            </p>
          ) : (
            <ol aria-label={mode === "cities" ? "Visits by city" : "Arrival feed"}>
              {mapped.map(({ row, precision }) => (
                <li key={row.id}>
                  <button
                    aria-pressed={selected === row.id}
                    onClick={() => setSelected(row.id)}
                  >
                    <strong>{row.city || "Location not recorded"}{mode === "cities" ? ` · ${row.views} ${row.views === 1 ? "visit" : "visits"}` : ""}</strong>
                    <span>{mode === "cities" ? row.label : row.country === "ZZ" ? "Location not recorded" : row.country}</span>
                    <small>
                      {mode === "cities" ? takeover ? "This takeover · includes repeat views" : "Today (UTC) · includes repeat views" : "On the wall now"}
                    </small>
                    <small>{precision}</small>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {mode === "cities" && report && <p className={styles.note}>{takeover ? "City counts match Views This Takeover and continue across midnight until the next owner takes over." : "City counts and the daily view total update together."} {report.historicalThrough ? `Historical cities were imported once from VisitorPing through ${new Date(report.historicalThrough).toISOString().slice(11, 19)} UTC. ` : ""}New views use our shared visit records. Visits without a recorded location are included in “Location not recorded.” No recurring VisitorPing API calls.</p>}
      {mode === "live" && <p className={styles.note}>
        Live status comes from this page’s heartbeat. Multiple tabs count once per browser.
        Hidden or closed tabs leave the live view; interrupted connections expire within about 40 seconds.
      </p>}
      <p className={styles.note}>
        Locations:{" "}
        <a
          href="https://www.geonames.org/"
          target="_blank"
          rel="noopener noreferrer"
        >
          GeoNames
        </a>{" "}
        · Map: Natural Earth · No precise visitor coordinates.
      </p>
    </section>
  );
}
