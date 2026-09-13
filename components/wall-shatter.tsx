"use client";
import { useEffect, useRef, useState } from "react";
export function WallShatter({ name }: { name: string }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [broken, setBroken] = useState(true);
  useEffect(() => {
    const el = canvas.current,
      c = el?.getContext("2d");
    if (!el || !c) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bricks = Array.from({ length: 50 }, (_, i) => ({
      x: 20 + (i % 10) * 54,
      y: 65 + Math.floor(i / 10) * 32,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 9,
      angle: 0,
      spin: (Math.random() - 0.5) * 0.12,
      floor: 280 + (i % 5) * 12,
      w: 51,
      h: 29,
    }));
    let id = 0,
      last = 0;
    const mouse = { x: -1000, y: -1000 };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) * 580) / r.width;
      mouse.y = ((e.clientY - r.top) * 360) / r.height;
    };
    el.addEventListener("pointermove", move);
    const draw = (now: number) => {
      const dt = last ? Math.min((now - last) / 16.67, 2) : 1;
      last = now;
      c.fillStyle = "#080a06";
      c.fillRect(0, 0, 580, 360);
      for (const b of bricks) {
        if (broken) {
          if (reduced) {
            b.y = b.floor;
            b.x = Math.max(0, Math.min(529, b.x));
          } else {
            b.angle += b.spin * dt;
            b.vy += 0.32 * dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.y > b.floor) {
              b.y = b.floor;
              b.vy *= -0.55;
              b.vx *= 0.98;
            }
            if (b.x < 0 || b.x > 529) {
              b.vx *= -0.8;
              b.x = Math.max(0, Math.min(529, b.x));
            }
            if (Math.hypot(b.x - mouse.x, b.y - mouse.y) < 45) {
              b.vy = -3;
              b.vx += (b.x - mouse.x) * 0.01;
            }
          }
        }
        c.save();
        c.translate(b.x + b.w / 2, b.y + b.h / 2);
        c.rotate(b.angle);
        c.fillStyle = "#d8ff36";
        c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        c.strokeStyle = "#516017";
        c.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
        c.restore();
      }
      c.fillStyle = broken ? "#d8ff36" : "#080a06";
      c.font = "bold 22px sans-serif";
      c.textAlign = "center";
      c.fillText(name.slice(0, 40), 290, broken ? 40 : 145, 510);
      if (broken && !reduced) id = requestAnimationFrame(draw);
    };
    draw(0);
    return () => {
      cancelAnimationFrame(id);
      el.removeEventListener("pointermove", move);
    };
  }, [broken, name]);
  return (
    <section>
      <canvas
        className="shatter-canvas"
        ref={canvas}
        width="580"
        height="360"
        aria-label={broken ? "Fallen wall bricks" : "Wall brick playground"}
      />
      <button onClick={() => setBroken((b) => !b)}>
        {broken ? "Rebuild" : "Shatter the wall"}
      </button>
      <p>
        Move your pointer through the bricks to push them. A local playground.
        Shattering doesn’t change the real wall, its owner, or anyone else’s
        view.
      </p>
    </section>
  );
}
