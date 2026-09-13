// @vitest-environment node
import { expect, it } from "vitest";
import { encodeMorse } from "../lib/morse";
import { paperBrickSvg } from "../lib/paper-brick";
it("encodes Morse with one-unit elements, three-unit letters and seven-unit words", () => {
  const result = encodeMorse("SOS E");
  expect(result.display).toBe("... --- ... / .");
  expect(result.tones.slice(0, 4)).toEqual([
    { start: 0, end: 1 },
    { start: 2, end: 3 },
    { start: 4, end: 5 },
    { start: 8, end: 11 },
  ]);
  expect(result.tones.at(-1)!.start - result.tones.at(-2)!.end).toBe(7);
});
it("normalizes accents, omits unsupported characters and bounds Morse playback", () => {
  expect(encodeMorse("é 🌈")).toMatchObject({ display: ".", units: 1 });
  expect(encodeMorse("E".repeat(500)).tones).toHaveLength(160);
  expect(encodeMorse("🌈").tones).toEqual([]);
});
it("escapes owner text and requires embedded safe image formats in paper templates", () => {
  const svg = paperBrickSvg({
    name: "<script>&".repeat(8),
    number: 16,
    qr: "data:image/png;base64,AA==",
    art: null,
  });
  expect(svg).not.toContain("<script>");
  expect(svg).toContain("&lt;script&gt;&amp;");
  expect(svg).toContain("TAKEOVER #16");
  expect(svg).toContain('width="190mm" height="235mm"');
  expect(() =>
    paperBrickSvg({ name: "x", number: 1, qr: "https://evil.com", art: null }),
  ).toThrow();
  expect(() =>
    paperBrickSvg({
      name: "x",
      number: 1,
      qr: "data:image/png;base64,AA==",
      art: 'data:image/svg+xml,<svg onload="x"/>',
    }),
  ).toThrow();
});
