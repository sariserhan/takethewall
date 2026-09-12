import type { MetadataRoute } from "next";
import { backend } from "@/lib/server";
import { siteUrl } from "@/lib/site-url";
export const dynamic = "force-dynamic";
export async function generateSitemaps() {
  const count = await backend<number>("growthSitemapCount", {});
  return Array.from({ length: count }, (_, id) => ({ id }));
}
export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const page = Number(await id);
  const rows = await backend<{ publicId: string; modified: number }[]>(
    "growthSitemap",
    { page },
  );
  return rows.map((t) => ({
    url: new URL(`/takeover/${t.publicId}`, siteUrl()).href,
    lastModified: new Date(t.modified),
    changeFrequency: "weekly",
    priority: 0.6,
  }));
}
