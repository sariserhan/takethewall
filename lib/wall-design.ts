import { validateUrl } from "./validation";
export type DesignBox = { x: number; y: number; w: number; h: number };
export type DesignBlock = {
  id: string;
  type: "heading" | "text" | "image" | "button";
  text: string;
  href?: string;
  image: string;
  color: string;
  fill: string;
  size: number;
  font: "display" | "sans" | "serif";
  align: "left" | "center" | "right";
  fit: "cover" | "contain";
  desktop: DesignBox;
  mobile: DesignBox;
};
export type WallDesign = {
  version: 1;
  background: string;
  gradient: string;
  backgroundImage: string;
  blocks: DesignBlock[];
};
export type DesignImage = { key: string; url: string; uploadKey?: string };
const hex = /^#[0-9a-f]{6}$/i;
const key = /^[a-zA-Z0-9_-]{1,80}$/;
export function parseWallDesign(
  value?: string,
  draft = false,
): WallDesign | null {
  if (!value) return null;
  if (typeof value !== "string" || value.length > 64000)
    throw Error("Wall design is too large.");
  let d: WallDesign;
  try {
    d = JSON.parse(value);
  } catch {
    throw Error("Invalid wall design.");
  }
  if (
    !d ||
    d.version !== 1 ||
    !hex.test(d.background) ||
    (d.gradient !== "" && !hex.test(d.gradient)) ||
    typeof d.backgroundImage !== "string" ||
    (d.backgroundImage && !key.test(d.backgroundImage)) ||
    !Array.isArray(d.blocks) ||
    d.blocks.length > 24 ||
    !d.blocks.length
  )
    throw Error("Choose a background and 1–24 wall blocks.");
  const ids = new Set<string>();
  for (const b of d.blocks) {
    if (
      !b ||
      typeof b.id !== "string" ||
      !key.test(b.id) ||
      ids.has(b.id) ||
      !["heading", "text", "image", "button"].includes(b.type) ||
      typeof b.text !== "string" ||
      b.text.length > 1000 ||
      /[\x00-\x09\x0b-\x1f]|<[^>]*>/.test(b.text) ||
      typeof b.image !== "string" ||
      (b.image && !key.test(b.image)) ||
      !hex.test(b.color) ||
      !hex.test(b.fill) ||
      !Number.isFinite(b.size) ||
      b.size < 12 ||
      b.size > 96 ||
      !["display", "sans", "serif"].includes(b.font) ||
      !["left", "center", "right"].includes(b.align) ||
      !["cover", "contain"].includes(b.fit)
    )
      throw Error(
        "Invalid wall block. Use plain text, supported colors and fonts.",
      );
    if (
      b.href !== undefined &&
      (typeof b.href !== "string" || b.href.length > 2048)
    )
      throw Error("Enter a valid block link.");
    if (b.href && !draft) validateUrl(b.href);
    ids.add(b.id);
    for (const box of [b.desktop, b.mobile])
      if (
        !box ||
        ![box.x, box.y, box.w, box.h].every(Number.isFinite) ||
        box.x < 0 ||
        box.y < 0 ||
        box.w < 5 ||
        box.h < 5 ||
        box.x + box.w > 100.01 ||
        box.y + box.h > 100.01
      )
        throw Error("Keep every block inside the wall canvas.");
  }
  // Rebuild a known shape; no arbitrary styles, HTML, URLs or event handlers survive.
  return {
    version: 1,
    background: d.background,
    gradient: d.gradient,
    backgroundImage: d.backgroundImage,
    blocks: d.blocks.map((b) => ({
      id: b.id,
      type: b.type,
      text: b.text,
      ...(b.href
        ? { href: draft ? b.href : validateUrl(b.href).websiteUrl }
        : {}),
      image: b.image,
      color: b.color,
      fill: b.fill,
      size: b.size,
      font: b.font,
      align: b.align,
      fit: b.fit,
      desktop: {
        x: b.desktop.x,
        y: b.desktop.y,
        w: b.desktop.w,
        h: b.desktop.h,
      },
      mobile: { x: b.mobile.x, y: b.mobile.y, w: b.mobile.w, h: b.mobile.h },
    })),
  };
}
export function designImageKeys(design: WallDesign | null) {
  return [
    ...new Set(
      [
        design?.backgroundImage,
        ...(design?.blocks
          .filter((b) => b.type === "image")
          .map((b) => b.image) ?? []),
      ].filter((x): x is string => !!x && x !== "logo"),
    ),
  ];
}
export function newDesignBlock(
  type: DesignBlock["type"],
  index = 0,
): DesignBlock {
  return {
    id: crypto.randomUUID(),
    type,
    text:
      type === "heading"
        ? "Your headline"
        : type === "button"
          ? "Visit my website"
          : "Make this space yours.",
    image: "",
    color: "#11110f",
    fill: "#d8ff36",
    size: type === "heading" ? 48 : type === "button" ? 16 : 20,
    font: type === "heading" ? "display" : "sans",
    align: "center",
    fit: "contain",
    desktop: { x: 10, y: Math.min(70, 10 + index * 10), w: 80, h: 20 },
    mobile: { x: 5, y: Math.min(80, index * 12), w: 90, h: 12 },
  };
}
export function designTemplate(
  name: string,
  title: string,
  message: string,
): WallDesign {
  const heading = newDesignBlock("heading"),
    text = newDesignBlock("text", 1),
    button = newDesignBlock("button", 2);
  heading.text = title || "YOUR MOMENT.";
  text.text = message || "One wall. Make it yours.";
  heading.desktop = { x: 8, y: 15, w: 84, h: 30 };
  text.desktop = { x: 15, y: 48, w: 70, h: 20 };
  button.desktop = { x: 30, y: 75, w: 40, h: 12 };
  heading.mobile = { x: 5, y: 12, w: 90, h: 28 };
  text.mobile = { x: 8, y: 44, w: 84, h: 24 };
  button.mobile = { x: 15, y: 76, w: 70, h: 12 };
  const dark = name === "launch";
  if (dark) for (const b of [heading, text]) b.color = "#ffffff";
  return {
    version: 1,
    background: dark ? "#11110f" : name === "poster" ? "#d8ff36" : "#f4f3eb",
    gradient: dark ? "#203c35" : "",
    backgroundImage: "",
    blocks: name === "message" ? [heading, text] : [heading, text, button],
  };
}

export function designUploadReferences(
  value: unknown,
): { key: string; uploadKey: string }[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 17)
    throw Error("Use up to sixteen canvas images.");
  const assets = value.filter((image) => image?.key !== "logo");
  if (assets.length > 16) throw Error("Use up to sixteen canvas images.");
  return assets.map((image) => {
    if (
      !image ||
      typeof image.key !== "string" ||
      !key.test(image.key) ||
      (image.uploadKey !== undefined &&
        (typeof image.uploadKey !== "string" || !key.test(image.uploadKey)))
    )
      throw Error("Invalid canvas image reference.");
    return { key: image.key, uploadKey: image.uploadKey ?? "" };
  });
}

export function designDestinations(value?: string): string[] {
  return [
    ...new Set(
      parseWallDesign(value)
        ?.blocks.map((b) => b.href)
        .filter((url): url is string => !!url) ?? [],
    ),
  ];
}

export function withPrimaryImage(value: string, title: string): string {
  const d = parseWallDesign(value, true);
  if (
    !d ||
    d.backgroundImage === "logo" ||
    d.blocks.some((b) => b.type === "image" && b.image === "logo")
  )
    return value;
  if (d.blocks.length >= 24)
    throw Error("Remove a block before adding another image.");
  const image = newDesignBlock("image", d.blocks.length);
  image.image = "logo";
  image.text = title || "Owner image";
  return JSON.stringify({ ...d, blocks: [...d.blocks, image] });
}
