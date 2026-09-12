import { backend } from "@/lib/server";
import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";
export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  const preview =
    process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production";
  return {
    rules: preview
      ? { userAgent: "*", disallow: "/" }
      : {
          userAgent: "*",
          allow: "/",
          disallow: [
            "/admin",
            "/owner",
            "/alerts",
            "/reward/",
            "/api/",
            "/*?purchase=",
            "/*&purchase=",
          ],
        },
    sitemap: [
      new URL("/sitemap.xml", siteUrl()).href,
      ...Array.from(
        {
          length: await backend<number>("growthSitemapCount", {}).catch(
            () => 0,
          ),
        },
        (_, id) => new URL(`/takeover-sitemap-${id}.xml`, siteUrl()).href,
      ),
    ],
  };
}
