"use client";
import { useRef } from "react";
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
