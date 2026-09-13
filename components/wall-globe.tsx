"use client";
import { useEffect, useState } from "react";
import { RegionLabel } from "./region-label";
// Approximate country centres; markers are aggregate regions, never visitor coordinates.
const centres: Record<string, [number, number]> = {
  US: [39, -98],
  CA: [57, -106],
  MX: [23, -102],
  BR: [-10, -52],
  AR: [-34, -64],
  CL: [-30, -71],
  CO: [4, -72],
  PE: [-10, -76],
  GB: [54, -2],
  UK: [54, -2],
  IE: [53, -8],
  FR: [47, 2],
  DE: [51, 10],
  ES: [40, -4],
  PT: [40, -8],
  IT: [43, 12],
  NL: [52, 5],
  BE: [51, 4],
  CH: [47, 8],
  AT: [48, 14],
  PL: [52, 20],
  SE: [62, 16],
  NO: [62, 10],
  FI: [64, 26],
  DK: [56, 10],
  UA: [49, 32],
  RO: [46, 25],
  GR: [39, 22],
  TR: [39, 35],
  RU: [60, 90],
  IN: [22, 79],
  PK: [30, 69],
  BD: [24, 90],
  CN: [35, 104],
  JP: [37, 138],
  KR: [36, 128],
  TW: [24, 121],
  HK: [22, 114],
  SG: [1, 104],
  MY: [4, 102],
  ID: [-2, 118],
  PH: [13, 122],
  VN: [16, 108],
  TH: [15, 101],
  AU: [-25, 134],
  NZ: [-41, 174],
  ZA: [-29, 24],
  NG: [9, 8],
  KE: [0, 38],
  EG: [27, 30],
  MA: [32, -6],
  IL: [31, 35],
  AE: [24, 54],
  SA: [24, 45],
};
export function WallGlobe({
  regions,
}: {
  regions: { regionCode: string; impressions: number }[];
}) {
  const [angle, setAngle] = useState(0),
    [spin, setSpin] = useState(false);
  useEffect(() => {
    if (!spin) return;
    const id = setInterval(() => {
      if (!document.hidden) setAngle((a) => (a + 1) % 360);
    }, 80);
    return () => clearInterval(id);
  }, [spin]);
  function point(lat: number, lon: number) {
    const a = (lat * Math.PI) / 180,
      b = ((lon + angle) * Math.PI) / 180;
    return {
      x: 200 + 170 * Math.cos(a) * Math.sin(b),
      y: 200 - 170 * Math.sin(a),
      z: Math.cos(a) * Math.cos(b),
    };
  }
  const paths: string[] = [];
  for (let lon = -180; lon < 180; lon += 30) {
    let d = "";
    for (let lat = -90; lat <= 90; lat += 3) {
      const p = point(lat, lon);
      d += (d ? "L" : "M") + p.x + "," + p.y;
    }
    paths.push(d.trim());
  }
  const sorted = [...regions].sort((a, b) => b.impressions - a.impressions);
  return (
    <section className="globe-view">
      <svg
        viewBox="0 0 400 400"
        role="img"
        aria-label="Wireframe globe of aggregate audience countries"
      >
        <circle cx="200" cy="200" r="170" fill="#080d07" stroke="#d8ff36" />
        {[-60, -30, 0, 30, 60].map((lat) => (
          <ellipse
            key={lat}
            cx="200"
            cy={200 - 170 * Math.sin((lat * Math.PI) / 180)}
            rx={170 * Math.cos((lat * Math.PI) / 180)}
            ry="8"
            fill="none"
            stroke="#486223"
          />
        ))}
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#486223" />
        ))}
        {sorted.map((r) => {
          const coord = centres[r.regionCode.toUpperCase()];
          if (!coord) return null;
          const p = point(...coord);
          return p.z > 0 ? (
            <g key={r.regionCode}>
              <circle cx={p.x} cy={p.y} r="5" fill="#d8ff36" />
              <text x={p.x + 8} y={p.y} fill="#f4f3eb" fontSize="10">
                {r.regionCode.toUpperCase()}
              </text>
            </g>
          ) : null;
        })}
      </svg>
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
        Current owner’s recorded impressions by country. Approximate country
        centres—not live locations or owner origins.
      </p>
      {sorted.length ? (
        <ul>
          {sorted.map((r) => (
            <li key={r.regionCode}>
              <RegionLabel code={r.regionCode} /> ·{" "}
              {r.impressions.toLocaleString("en-US")} impressions
              {!centres[r.regionCode.toUpperCase()] ? " · not plotted" : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p>No country data yet. The globe will populate as analytics arrive.</p>
      )}
    </section>
  );
}
