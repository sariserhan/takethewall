import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// app/icon.svg is the editable master; no fonts or external assets are required.
const source = await readFile(new URL("../app/icon.svg", import.meta.url));
const root = new URL("../", import.meta.url);
await mkdir(new URL("public/brand/", root), { recursive: true });
await writeFile(new URL("public/brand/takethewall-icon.svg", root), source);
for (const [size, path] of [
  [1024, "public/brand/takethewall-icon-1024.png"],
  [512, "public/brand/takethewall-icon-512.png"],
  [192, "public/brand/takethewall-icon-192.png"],
  [180, "app/apple-icon.png"],
]) {
  await sharp(source).resize(size, size).png().toFile(new URL(path, root).pathname);
}
const sizes = [16, 32, 48, 64];
const frames = await Promise.all(sizes.map(size => sharp(source).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(new URL("app/favicon.ico", root), Buffer.concat([header, ...frames]));
console.log("Generated SVG, PNG icons, Apple icon, and 16/32/48/64px favicon.");
