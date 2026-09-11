import { describe, it, expect } from "vitest";
import {
  validateUrl,
  validateDescription,
  validateEmail,
  validateFile,
  validateContent,
  ctr,
  topRegions,
  safeDestination,
  excludedTraffic,
} from "../lib/validation";
describe("buyer validation", () => {
  it.each([
    "http://example.com",
    "javascript:alert(1)",
    "data:text/html,x",
    "https://localhost",
    "https://127.1",
    "https://2130706433",
    "https://10.1.2.3",
    "https://172.16.0.1",
    "https://192.168.1.1",
    "https://169.254.169.254",
    "https://100.64.0.1",
    "https://[::1]",
    "https://[::ffff:127.0.0.1]",
    "https://local.internal",
    "https://user:secret@example.com",
    "https://example.com:8443",
  ])("rejects %s", (u) => expect(() => validateUrl(u)).toThrow());
  it("normalizes a public HTTPS destination", () =>
    expect(validateUrl(" https://WWW.VisitorPing.com/hello?q=yes#x ")).toEqual({
      websiteUrl: "https://www.visitorping.com/hello?q=yes#x",
      domain: "visitorping.com",
    }));
  it("validates plain descriptions and unicode length", () => {
    expect(validateDescription(" x ")).toBe("x");
    expect(validateDescription("🙂".repeat(120))).toHaveLength(240);
    expect(() => validateDescription("x".repeat(121))).toThrow();
    expect(() => validateDescription("<script>evil</script>")).toThrow();
    expect(() => validateDescription(" ")).toThrow();
  });
  it("preserves email semantics while trimming", () => {
    expect(validateEmail(" Buyer+Wall@Example.com ")).toBe(
      "Buyer+Wall@Example.com",
    );
    for (const x of [
      "missing",
      "a@",
      "a\nb@example.com",
      "a".repeat(65) + "@example.com",
      "a@" + "b".repeat(250) + ".com",
    ])
      expect(() => validateEmail(x)).toThrow();
  });
  it("validates file type, extension and bounds", () => {
    expect(() =>
      validateFile({
        name: "logo.PNG",
        type: "image/png",
        size: 2 * 1024 * 1024,
      }),
    ).not.toThrow();
    for (const f of [
      { name: "x.svg", type: "image/svg+xml", size: 5 },
      { name: "x.png", type: "image/jpeg", size: 5 },
      { name: "x.webp", type: "image/webp", size: 2 * 1024 * 1024 + 1 },
      { name: "x.png", type: "image/png", size: 0 },
    ])
      expect(() => validateFile(f)).toThrow();
  });
  it("rejects blocked domains and obvious policy violations", () => {
    expect(() => validateContent("sub.bad.com", "Hello", "bad.com")).toThrow();
    expect(() => validateContent("nice.com", "steal passwords")).toThrow();
  });
});
describe("public metrics", () => {
  it("uses honest unclamped CTR", () => {
    expect(ctr(0, 10)).toBe(0);
    expect(ctr(2, 3)).toBe(150);
  });
  it("aggregates the remaining regions", () => {
    const r = topRegions(
      ["US", "GB", "CA", "DE", "FR", "ES"].map((regionCode, i) => ({
        regionCode,
        impressions: 6 - i,
      })),
    );
    expect(r).toHaveLength(5);
    expect(r[4]).toMatchObject({ regionCode: "Other", impressions: 3 });
    expect(r.reduce((n, x) => n + x.percent, 0)).toBeCloseTo(100);
  });
  it("strips all query parameters and fragments", () =>
    expect(
      safeDestination("https://example.com/path?email=private#token"),
    ).toBe("https://example.com/path"));
  it("excludes bots and development", () => {
    expect(excludedTraffic("Googlebot", true, false)).toBe(true);
    expect(excludedTraffic("Mozilla", false, false)).toBe(true);
    expect(excludedTraffic("Mozilla", true, true)).toBe(true);
    expect(excludedTraffic("Mozilla", true, false)).toBe(false);
  });
});
