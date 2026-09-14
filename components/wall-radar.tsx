"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useConvexConnectionState } from "convex/react";
import { geoArea, geoCentroid, geoEquirectangular, geoPath } from "d3-geo";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import { api } from "@/convex/_generated/api";
import { cityLookup, type CityCenter } from "@/lib/radar-geography";
import styles from "./wall-radar.module.css";
type Country = Feature<Geometry, { name: string; code: string }>;
type Arrival = {
  id: string;
  receivedAt: number;
  city: string;
  country: string;
};
const place = (row: Arrival) =>
  [row.city, row.country].filter(Boolean).join(", ") || "Location unavailable";
export function WallRadar() {
  const live = useQuery(api.visitorPingWebhook.radar, {});
  const connection = useConvexConnectionState();
  const [held, setHeld] = useState<Arrival[] | null>(null);
  const [countries, setCountries] = useState<Country[]>([]),
    [cities, setCities] = useState<CityCenter[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [flashes, setFlashes] = useState<string[]>([]),
    [selected, setSelected] = useState("");
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const rows = held ?? live ?? [];
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
      held ||
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
  }, [live, held]);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );
  const latest = rows[0];
  return (
    <section
      className={styles.radar}
      aria-label="Recent visitor arrivals"
      data-testid="radar"
    >
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>RADAR · VISITORPING ARRIVALS</span>
          <h2>The world, dropping by.</h2>
          <p>City-level arrival alerts as they reach the wall.</p>
        </div>
        <span className={styles.status}>
          {held
            ? "PAUSED"
            : connection.isWebSocketConnected
              ? "LISTENING"
              : "RECONNECTING"}
        </span>
      </header>
      <div className={styles.controls}>
        <button
          onClick={() => {
            setHeld(held ? null : [...rows]);
            setFlashes([]);
          }}
          aria-pressed={held !== null}
        >
          {held ? "Resume arrivals" : "Pause arrivals"}
        </button>
        <span>
          {rows.length} received {rows.length === 1 ? "alert" : "alerts"}
          {rows.length === 50 ? " · latest 50 deliveries" : ""}
        </span>
      </div>
      <p className={styles.note}>
        Arrival sound is enabled across the wall, even when Radar is closed.
        Click or tap anywhere first to allow audio. Pausing this feed pauses its
        display only.
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
                  Latest received ·{" "}
                  {new Date(latest.receivedAt).toISOString().slice(11, 19)} UTC
                </span>
              </>
            ) : (
              <>
                <strong>
                  {live === undefined
                    ? "Connecting to arrivals…"
                    : "Waiting for the next arrival."}
                </strong>
                <span>
                  Real alerts will appear here when VisitorPing delivers them.
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
          <h3>Recent arrivals</h3>
          {!rows.length ? (
            <p>
              No arrival alerts yet. Leave Radar open to watch the next one come
              in.
            </p>
          ) : (
            <ol aria-label="Arrival feed">
              {mapped.map(({ row, precision }) => (
                <li key={row.id}>
                  <button
                    aria-pressed={selected === row.id}
                    onClick={() => setSelected(row.id)}
                  >
                    <strong>{row.city || "City unavailable"}</strong>
                    <span>{row.country || "Country unavailable"}</span>
                    <small>
                      {new Date(row.receivedAt)
                        .toISOString()
                        .replace("T", " ")
                        .slice(0, 19)}{" "}
                      UTC · received
                    </small>
                    <small>{precision}</small>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <p className={styles.note}>
        Source: <a href="https://visitorping.com/" target="_blank" rel="noopener noreferrer">VisitorPing</a>.
        Radar shows received alerts, not unique visitors. Repeat deliveries can
        appear, so this count may differ from the VisitorPing dashboard. Times
        show when each alert reached the wall.
      </p>
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
