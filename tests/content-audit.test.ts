import { expect, it } from "vitest";
import { validateWallContent, detectLinkType } from "../lib/content";
import { auditHash, canonical } from "../lib/audit";
it("accepts personal content without a destination and validates display names", () => {
  expect(
    validateWallContent({
      contentType: "personal",
      websiteUrl: "",
      displayName: "Serhan",
      description: "I was here",
    }),
  ).toMatchObject({
    websiteUrl: "",
    contentType: "personal",
    displayName: "Serhan",
  });
  expect(() =>
    validateWallContent({
      contentType: "personal",
      websiteUrl: "",
      displayName: "",
      description: "",
    }),
  ).toThrow();
});
it("detects platform destinations without matching spoofed domains", () => {
  expect(detectLinkType("https://apps.apple.com/us/app/123")).toBe("ios_app");
  expect(detectLinkType("https://tiktok.com/@a")).toBe("tiktok");
  expect(detectLinkType("https://tiktok.com.attacker.com")).toBe("website");
});
it("canonical hash is stable across object ordering and detects changes", () => {
  expect(canonical({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  expect(auditHash({ b: 2, a: 1 })).toBe(auditHash({ a: 1, b: 2 }));
  expect(auditHash({ a: 1 })).not.toBe(auditHash({ a: 2 }));
});

it("allows multiline private correspondence but rejects active HTML", async () => {
  const { plainText } = await import("../lib/content");
  expect(plainText("First line\nSecond line", 5000, true, true)).toBe(
    "First line\nSecond line",
  );
  expect(() => plainText("<script>bad</script>", 5000, true, true)).toThrow();
});
