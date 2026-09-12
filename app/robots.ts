import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";
export default function robots(): MetadataRoute.Robots {
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
            "/reward/",
            "/api/",
            "/*?purchase=",
            "/*&purchase=",
          ],
        },
    sitemap: new URL("/sitemap.xml", siteUrl()).href,
  };
}
