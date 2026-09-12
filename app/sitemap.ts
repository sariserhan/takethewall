import type { MetadataRoute } from "next";
import { MILESTONES } from "@/lib/config";
import { siteUrl } from "@/lib/site-url";
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  return [
    { url: new URL("/", origin).href, changeFrequency: "daily", priority: 1 },
    ...MILESTONES.map(({ takeoverNumber }) => ({
      url: new URL(`/${takeoverNumber}`, origin).href,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
