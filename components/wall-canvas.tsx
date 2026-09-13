"use client";
import Image from "next/image";
import type { CSSProperties } from "react";
import { parseWallDesign, type DesignImage } from "@/lib/wall-design";
export function WallCanvas({
  design,
  images = [],
  href,
  onVisit,
  device,
  editing = false,
  selected,
}: {
  design: string;
  images?: DesignImage[];
  href?: string;
  onVisit?: () => void;
  device?: "desktop" | "mobile";
  editing?: boolean;
  selected?: string;
}) {
  let d;
  try {
    d = parseWallDesign(design);
  } catch {
    return <p>Design unavailable.</p>;
  }
  if (!d) return null;
  const image = (key: string) => images.find((i) => i.key === key)?.url;
  return (
    <div
      className="wall-canvas"
      data-device={device}
      aria-label="Owner designed wall"
      style={{ backgroundColor: d.background }}
    >
      <div
        className="wall-canvas-surface"
        style={{
          background: d.gradient
            ? `linear-gradient(135deg, ${d.background}, ${d.gradient})`
            : d.background,
        }}
      >
        {image(d.backgroundImage) && (
          <Image
            className="canvas-background"
            src={image(d.backgroundImage)!}
            alt=""
            fill
            unoptimized
          />
        )}
        {d.blocks.map((b) => {
          const styles = {
            "--dx": `${b.desktop.x}%`,
            "--dy": `${b.desktop.y}%`,
            "--dw": `${b.desktop.w}%`,
            "--dh": `${b.desktop.h}%`,
            "--mx": `${b.mobile.x}%`,
            "--my": `${b.mobile.y}%`,
            "--mw": `${b.mobile.w}%`,
            "--mh": `${b.mobile.h}%`,
            "--canvas-color": b.color,
            "--canvas-fill": b.fill,
            "--canvas-size": `${b.size}px`,
            fontFamily:
              b.font === "display"
                ? "var(--display)"
                : b.font === "serif"
                  ? "Georgia, serif"
                  : "var(--body)",
            textAlign: b.align,
            justifyContent:
              b.align === "left"
                ? "flex-start"
                : b.align === "right"
                  ? "flex-end"
                  : "center",
          } as CSSProperties;
          return (
            <div
              className={`canvas-block canvas-${b.type}${editing ? " editable" : ""}${selected === b.id ? " selected" : ""}`}
              data-block-id={b.id}
              key={b.id}
              style={styles}
            >
              {b.type === "image" ? (
                image(b.image) ? (
                  <Image
                    src={image(b.image)!}
                    alt={b.text || "Owner image"}
                    fill
                    style={{ objectFit: b.fit }}
                    unoptimized
                  />
                ) : (
                  <span className="canvas-image-empty">Choose image</span>
                )
              ) : b.type === "button" ? (
                href && !editing ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    onClick={onVisit}
                    onAuxClick={(e) => {
                      if (e.button === 1) onVisit?.();
                    }}
                  >
                    {b.text}
                  </a>
                ) : (
                  <span className="canvas-link-preview">{b.text}</span>
                )
              ) : b.type === "heading" ? (
                <h2>{b.text}</h2>
              ) : (
                <p>{b.text}</p>
              )}
              {editing && selected === b.id && (
                <span
                  className="canvas-resize"
                  data-resize="true"
                  aria-hidden="true"
                >
                  ↘
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
