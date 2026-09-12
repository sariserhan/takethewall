"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { validateFile } from "@/lib/validation";
import { cropRectangle, defaultCrop, type CropOptions } from "@/lib/image-crop";

export function ImageUpload({
  label = "Image",
  disabled = false,
  onUploaded,
  onPending,
}: {
  label?: string;
  disabled?: boolean;
  onUploaded: (result: { uploadKey: string; logoUrl: string }) => void;
  onPending: (pending: boolean) => void;
}) {
  const [source, setSource] = useState<{
    file: File;
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [crop, setCrop] = useState<CropOptions>(defaultCrop),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    width: number;
  } | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source.url);
    },
    [source],
  );
  async function select(file?: File) {
    if (!file) return;
    const attempt = ++generation.current;
    setError("");
    let url = "";
    try {
      validateFile(file);
      onPending(true);
      url = URL.createObjectURL(file);
      const image = new window.Image();
      image.src = url;
      await image.decode();
      if (attempt !== generation.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (image.naturalWidth * image.naturalHeight > 16_000_000)
        throw new Error("Choose an image up to 16 megapixels.");
      setSource({
        file,
        url,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      setCrop(defaultCrop);
      onPending(true);
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      if (attempt !== generation.current) return;
      onPending(Boolean(source));
      setError(e instanceof Error ? e.message : "Could not open this image.");
    }
  }
  async function apply() {
    if (!source || busy) return;
    const attempt = generation.current;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("logo", source.file);
      form.set("crop", JSON.stringify(crop));
      const response = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not upload image. Try again.");
      if (attempt !== generation.current) return;
      onUploaded(result);
      setSource(null);
      onPending(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  const rect = source ? cropRectangle(source.width, source.height, crop) : null;
  return (
    <div className="image-upload">
      <label>
        {label}
        <span className="field-hint">
          Optional · PNG, JPEG or WEBP · 2 MB max
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled || busy}
          onChange={(e) => {
            void select(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {source && rect && (
        <div className="image-crop-controls">
          <p>
            Crop and position your image. Keep Original to show the whole image,
            or choose a shape and zoom in.
          </p>
          <fieldset disabled={busy || disabled}>
            <label>
              Image shape
              <select
                value={crop.shape}
                onChange={(e) =>
                  setCrop({
                    ...defaultCrop,
                    shape: e.target.value as CropOptions["shape"],
                  })
                }
              >
                <option value="original">Original</option>
                <option value="square">Square</option>
                <option value="landscape">Landscape (16:9)</option>
                <option value="portrait">Portrait (4:5)</option>
              </select>
            </label>
            <div
              className="crop-viewport"
              aria-label="Image crop preview"
              style={{
                aspectRatio: `${rect.width}/${rect.height}`,
                width: `min(100%, ${Math.min(420, (340 * rect.width) / rect.height)}px)`,
              }}
              onPointerDown={(e) => {
                if (busy || disabled) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = {
                  x: crop.x,
                  y: crop.y,
                  startX: e.clientX,
                  startY: e.clientY,
                  width: e.currentTarget.getBoundingClientRect().width,
                };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                const scale = rect.width / d.width;
                setCrop((c) => ({
                  ...c,
                  x: Math.max(
                    0,
                    Math.min(
                      100,
                      d.x -
                        (((e.clientX - d.startX) * scale) /
                          Math.max(1, source.width - rect.width)) *
                          100,
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      100,
                      d.y -
                        (((e.clientY - d.startY) * scale) /
                          Math.max(1, source.height - rect.height)) *
                          100,
                    ),
                  ),
                }));
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <Image
                src={source.url}
                alt="Image crop preview"
                unoptimized
                width={source.width}
                height={source.height}
                draggable={false}
                style={{
                  position: "absolute",
                  maxWidth: "none",
                  width: `${(source.width / rect.width) * 100}%`,
                  height: `${(source.height / rect.height) * 100}%`,
                  left: `${(-rect.left / rect.width) * 100}%`,
                  top: `${(-rect.top / rect.height) * 100}%`,
                }}
              />
            </div>
            <p className="field-note">
              Drag the image or use the position sliders. This crop is used on
              desktop and mobile.
            </p>
            <label>
              Zoom ({crop.zoom.toFixed(1)}×)
              <input
                type="range"
                min="1"
                max="4"
                step="0.1"
                value={crop.zoom}
                onChange={(e) =>
                  setCrop({ ...crop, zoom: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Horizontal position
              <input
                type="range"
                min="0"
                max="100"
                value={crop.x}
                disabled={rect.width === source.width}
                onChange={(e) =>
                  setCrop({ ...crop, x: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Vertical position
              <input
                type="range"
                min="0"
                max="100"
                value={crop.y}
                disabled={rect.height === source.height}
                onChange={(e) =>
                  setCrop({ ...crop, y: Number(e.target.value) })
                }
              />
            </label>
            <div className="crop-actions">
              <button type="button" onClick={() => setCrop(defaultCrop)}>
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  generation.current++;
                  setSource(null);
                  setError("");
                  onPending(false);
                }}
              >
                Cancel image change
              </button>
              <button
                type="button"
                className="button"
                onClick={() => void apply()}
              >
                Apply image
              </button>
            </div>
          </fieldset>
          {busy && <p role="status">Processing and uploading your image…</p>}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
