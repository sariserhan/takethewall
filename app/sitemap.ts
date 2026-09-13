import { backend } from "@/lib/server";
import type { MetadataRoute } from "next";
import { MILESTONES } from "@/lib/config";
import { siteUrl } from "@/lib/site-url";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const history = await backend<boolean>("growthVisibility", {}).catch(
    () => false,
  );
  const origin = siteUrl();
  return [
    { url: new URL("/", origin).href, changeFrequency: "daily", priority: 1 },
    ...(history
      ? [
          {
            url: new URL("/history", origin).href,
            changeFrequency: "daily" as const,
            priority: 0.8,
          },
        ]
      : []),
    ...MILESTONES.flatMap(({ takeoverNumber }) => [
      {
        url: new URL(`/${takeoverNumber}`, origin).href,
        changeFrequency: "daily" as const,
        priority: 0.8,
      },
      {
        url: new URL(`/${takeoverNumber}/referral`, origin).href,
        changeFrequency: "daily" as const,
        priority: 0.8,
      },
    ]),
  ];
}
