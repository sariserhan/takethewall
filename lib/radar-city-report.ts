export type RadarCityReport = {
  date: string; to: string; uniqueVisitors: number; views: number; truncated: boolean;
  cities: { label: string; city: string; country: string; visitors: number; views: number }[];
};
const count = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
export async function readRadarCityReport(apiKey: string, siteId: string, date: string, to: string): Promise<RadarCityReport> {
  const from = date + "T00:00:00.000Z";
  async function read(endpoint: string, extra: Record<string, string>) {
    const url = new URL(`https://visitorping.com/api/v1/sites/${encodeURIComponent(siteId)}/${endpoint}`);
    url.search = new URLSearchParams({ from, to, traffic: "exclude_bots", event: "wall_impression", ...extra }).toString();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!response.ok) throw Error("City report unavailable");
    const body = await response.json();
    if (body.apiVersion !== "1" || body.site?.id !== siteId || body.traffic !== "exclude_bots" || body.filter?.event !== "wall_impression" || body.filter?.property || Date.parse(body.range?.from) !== Date.parse(from) || Date.parse(body.range?.to) !== Date.parse(to)) throw Error("Invalid city report scope");
    return body.data;
  }
  const [groups, totals] = await Promise.all([read("breakdowns", { dimension: "city", limit: "100" }), read("analytics", { interval: "day" })]);
  if (groups?.dimension !== "city" || !Array.isArray(groups.rows) || groups.rows.length > 100 || typeof groups.truncated !== "boolean" || !count(totals?.totals?.uniqueVisitors) || !count(totals?.totals?.events)) throw Error("Invalid city report");
  const labels = new Set<string>();
  const cities = groups.rows.map((row: { value: string; uniqueVisitors: number; events: number }) => {
    if (typeof row.value !== "string" || row.value.length > 500 || !count(row.uniqueVisitors) || !count(row.events) || labels.has(row.value)) throw Error("Invalid city group");
    labels.add(row.value);
    const parts = row.value.split(",").map(p => p.trim());
    const last = parts.at(-1) ?? "";
    return { label: row.value, city: parts.length >= 3 ? parts.slice(0, -2).join(", ") : parts.length === 2 ? parts[0] : row.value, country: /^[A-Z]{2}$/.test(last) ? last : "ZZ", visitors: row.uniqueVisitors, views: row.events };
  });
  return { date, to, uniqueVisitors: totals.totals.uniqueVisitors, views: totals.totals.events, truncated: groups.truncated, cities };
}
