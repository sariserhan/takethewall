"use client";
import { useId, useRef, useState } from "react";
export function Blacklight() {
  const id = useId(),
    [point, setPoint] = useState({ x: 300, y: 150 }),
    [show, setShow] = useState(false);
  return (
    <section>
      <p>
        Explore curated wall Easter eggs with your UV beam. Move, tap, or use
        arrow keys. These are original site messages, not private owner records.
      </p>
      <svg
        className="blacklight-stage"
        viewBox="0 0 600 300"
        tabIndex={0}
        role="application"
        aria-label="Blacklight exploration surface"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPoint({
            x: ((e.clientX - r.left) / r.width) * 600,
            y: ((e.clientY - r.top) / r.height) * 300,
          });
        }}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPoint({
            x: ((e.clientX - r.left) / r.width) * 600,
            y: ((e.clientY - r.top) / r.height) * 300,
          });
        }}
        onKeyDown={(e) => {
          const d: Record<string, [number, number]> = {
            ArrowLeft: [-25, 0],
            ArrowRight: [25, 0],
            ArrowUp: [0, -25],
            ArrowDown: [0, 25],
          };
          if (d[e.key]) {
            e.preventDefault();
            const [x, y] = d[e.key];
            setPoint((p) => ({
              x: Math.max(0, Math.min(600, p.x + x)),
              y: Math.max(0, Math.min(300, p.y + y)),
            }));
          }
        }}
      >
        <defs>
          <radialGradient id={id + "glow"}>
            <stop stopColor="#b16bff" stopOpacity=".65" />
            <stop offset="1" stopColor="#100421" stopOpacity="0" />
          </radialGradient>
          <mask id={id + "mask"}>
            <circle cx={point.x} cy={point.y} r="95" fill="white" />
          </mask>
        </defs>
        <rect width="600" height="300" fill="#100421" />
        <circle cx={point.x} cy={point.y} r="120" fill={`url(#${id}glow)`} />
        <g
          mask={show ? undefined : `url(#${id}mask)`}
          fill="#dcff5c"
          fontFamily="monospace"
          fontSize="22"
          fontWeight="bold"
        >
          <text x="30" y="65">
            ONE WALL. MANY STORIES.
          </text>
          <text x="180" y="155">
            YOU FOUND YOUR MOMENT.
          </text>
          <text x="40" y="260">
            LEAVE SOMETHING WORTH FINDING.
          </text>
        </g>
        <circle
          cx={point.x}
          cy={point.y}
          r="95"
          fill="none"
          stroke="#b986ff"
          strokeDasharray="3 6"
        />
      </svg>
      <button
        className="wall-action"
        aria-pressed={show}
        onClick={() => setShow(!show)}
      >
        {show ? "Hide secrets" : "Reveal all secrets"}
      </button>
      {show && (
        <p>
          One wall. Many stories. You found your moment. Leave something worth
          finding.
        </p>
      )}
    </section>
  );
}
export function ThermalTrail() {
  const canvas = useRef<HTMLCanvasElement>(null);
  function draw(x: number, y: number) {
    const c = canvas.current?.getContext("2d");
    if (!c) return;
    c.fillStyle = "rgba(4,5,15,.09)";
    c.fillRect(0, 0, 600, 300);
    const g = c.createRadialGradient(x, y, 0, x, y, 45);
    g.addColorStop(0, "#fff9ae");
    g.addColorStop(0.2, "#ffb51a");
    g.addColorStop(0.55, "#ff381b99");
    g.addColorStop(1, "#d0169000");
    c.fillStyle = g;
    c.fillRect(x - 45, y - 45, 90, 90);
  }
  const position = useRef({ x: 300, y: 150 });
  return (
    <section>
      <p>
        <strong>Your cursor only.</strong> A local heat trail—not other
        visitors’ activity. Nothing is sent to the server.
      </p>
      <canvas
        ref={canvas}
        width={600}
        height={300}
        className="thermal-stage"
        tabIndex={0}
        role="application"
        aria-label="Personal thermal trail. Move, tap, or use arrow keys."
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          draw(
            ((e.clientX - r.left) / r.width) * 600,
            ((e.clientY - r.top) / r.height) * 300,
          );
        }}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          draw(
            ((e.clientX - r.left) / r.width) * 600,
            ((e.clientY - r.top) / r.height) * 300,
          );
        }}
        onKeyDown={(e) => {
          const d: Record<string, [number, number]> = {
            ArrowLeft: [-15, 0],
            ArrowRight: [15, 0],
            ArrowUp: [0, -15],
            ArrowDown: [0, 15],
          };
          if (d[e.key]) {
            e.preventDefault();
            position.current = {
              x: Math.max(0, Math.min(600, position.current.x + d[e.key][0])),
              y: Math.max(0, Math.min(300, position.current.y + d[e.key][1])),
            };
            draw(position.current.x, position.current.y);
          }
        }}
      />
      <button
        className="wall-action"
        onClick={() =>
          canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 300)
        }
      >
        Clear trail
      </button>
    </section>
  );
}
