export const cropShapes = {
  original: 0,
  square: 1,
  landscape: 16 / 9,
  portrait: 4 / 5,
} as const;
export interface CropOptions {
  shape: keyof typeof cropShapes;
  zoom: number;
  x: number;
  y: number;
}
export const defaultCrop: CropOptions = {
  shape: "original",
  zoom: 1,
  x: 50,
  y: 50,
};
export function parseCrop(value: unknown): CropOptions {
  if (!value || typeof value !== "object")
    throw new Error("Invalid image crop.");
  const a = value as Record<string, unknown>;
  if (
    typeof a.shape !== "string" ||
    !Object.hasOwn(cropShapes, a.shape) ||
    typeof a.zoom !== "number" ||
    !Number.isFinite(a.zoom) ||
    a.zoom < 1 ||
    a.zoom > 4 ||
    typeof a.x !== "number" ||
    !Number.isFinite(a.x) ||
    a.x < 0 ||
    a.x > 100 ||
    typeof a.y !== "number" ||
    !Number.isFinite(a.y) ||
    a.y < 0 ||
    a.y > 100
  )
    throw new Error("Invalid image crop.");
  return {
    shape: a.shape as CropOptions["shape"],
    zoom: a.zoom,
    x: a.x,
    y: a.y,
  };
}
export function cropRectangle(
  width: number,
  height: number,
  value: CropOptions,
) {
  const a = parseCrop(value);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error("Invalid image dimensions.");
  const ratio = cropShapes[a.shape] || width / height;
  const baseWidth = Math.min(width, height * ratio);
  const w = Math.max(1, Math.min(width, Math.round(baseWidth / a.zoom)));
  const h = Math.max(
    1,
    Math.min(height, Math.round(baseWidth / ratio / a.zoom)),
  );
  return {
    left: Math.round(((width - w) * a.x) / 100),
    top: Math.round(((height - h) * a.y) / 100),
    width: w,
    height: h,
  };
}
