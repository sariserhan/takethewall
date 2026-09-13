"use client";
import Image from "next/image";
import type { CSSProperties } from "react";
import { parseWallDesign, type DesignImage } from "@/lib/wall-design";
export function WallCanvas({
  design,
  images = [],
  href,
  linksEnabled = true,
  onVisit,
  device,
  editing = false,
  selected,
  onDelete,
  deleteDisabled = false,
}: {
  design: string;
  images?: DesignImage[];
  href?: string;
  linksEnabled?: boolean;
  onVisit?: () => void;
  device?: "desktop" | "mobile";
  editing?: boolean;
  selected?: string;
  onDelete?: (id: string) => void;
  deleteDisabled?: boolean;
}) {
  let d;
  try {
    d = parseWallDesign(design, editing);
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
        <div className="canvas-content">
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
                  (b.href || href) && linksEnabled && !editing ? (
                    <a
                      href={b.href || href}
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
                {editing && selected === b.id && onDelete && (
                  <button
                    type="button"
                    className="canvas-delete"
                    aria-label="Delete selected block"
                    title={
                      deleteDisabled
                        ? "Keep at least one block"
                        : "Delete block"
                    }
                    disabled={deleteDisabled}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(b.id);
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
                    </svg>
                  </button>
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
    </div>
  );
}
