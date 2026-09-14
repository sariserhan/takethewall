import { unstable_cache } from "next/cache";
import { readRadarCityReport } from "@/lib/radar-city-report";
export const runtime = "nodejs";
const report = unstable_cache(async (date: string, siteId: string) => {
  const apiKey = process.env.VISITORPING_API_KEY;
  if (!apiKey) throw Error("City report unavailable");
  const to = new Date(Math.max(Date.parse(date + "T00:00:00.000Z") + 1, Date.now() - 5000)).toISOString();
  return readRadarCityReport(apiKey, siteId, date, to);
}, ["radar-city-report-v1"], { revalidate: 300 });
export async function GET() {
  try {
    const siteId = process.env.VISITORPING_SITE_ID;
    if (!siteId) throw Error("City report unavailable");
    const date = new Date().toISOString().slice(0, 10);
    return Response.json(await report(date, siteId), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "City report is temporarily unavailable. Live visitors are still available." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
