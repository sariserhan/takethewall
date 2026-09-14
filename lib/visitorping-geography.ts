import { VisitorPingReadError } from "./visitorping-api";
export type WebsiteGeography = {
  from: string;
  to: string;
  fetchedAt: number;
  historyDays: number;
  uniqueVisitors: number;
  countries: { countryCode: string; visitors: number }[];
  truncated: boolean;
};
const count = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
export async function readWebsiteGeography(args: {
  apiKey: string;
  siteId: string;
}): Promise<WebsiteGeography> {
  async function read(endpoint: string, params: Record<string, string> = {}) {
    const url = new URL(
      `https://visitorping.com/api/v1/sites/${encodeURIComponent(args.siteId)}/${endpoint}`,
    );
    url.search = new URLSearchParams({
      traffic: "exclude_bots",
      ...params,
    }).toString();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${args.apiKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const retry = Number(response.headers.get("Retry-After"));
      throw new VisitorPingReadError(
        Math.max(Number.isFinite(retry) ? retry * 1000 : 0, 30 * 60_000),
        `VisitorPing HTTP ${response.status}`,
      );
    }
    const body = await response.json();
    if (
      body?.apiVersion !== "1" ||
      body?.site?.id !== args.siteId ||
      body?.traffic !== "exclude_bots" ||
      body?.filter ||
      (params.from &&
        (Date.parse(body?.range?.from) !== Date.parse(params.from) ||
          Date.parse(body?.range?.to) !== Date.parse(params.to)))
    )
      throw new VisitorPingReadError(
        30 * 60_000,
        "Invalid VisitorPing website report",
      );
    return body;
  }
  // Discover plan retention rather than assuming that an arbitrary start date is available.
  const metadata = await read("analytics");
  const historyDays = metadata.historyDays,
    generatedAt = Date.parse(metadata.generatedAt);
  if (
    !Number.isSafeInteger(historyDays) ||
    historyDays < 1 ||
    historyDays > 3660 ||
    !Number.isFinite(generatedAt)
  )
    throw new VisitorPingReadError(
      30 * 60_000,
      "VisitorPing history range unavailable",
    );
  // A minute of margin prevents the rolling retention boundary racing this request.
  const from = new Date(
    generatedAt - historyDays * 86400_000 + 60_000,
  ).toISOString();
  const to = new Date(generatedAt - 5000).toISOString();
  const [totals, geography] = await Promise.all([
    read("analytics", { from, to, interval: "day" }),
    read("breakdowns", { from, to, dimension: "country", limit: "100" }),
  ]);
  const rows = geography?.data?.rows;
  if (
    !count(totals?.data?.totals?.uniqueVisitors) ||
    geography?.data?.dimension !== "country" ||
    !Array.isArray(rows) ||
    rows.length > 100 ||
    typeof geography?.data?.truncated !== "boolean"
  )
    throw new VisitorPingReadError(
      30 * 60_000,
      "Invalid VisitorPing country totals",
    );
  const seen = new Set<string>();
  const countries = rows
    .map((row) => {
      if (
        typeof row?.value !== "string" ||
        row.value.length > 80 ||
        !count(row?.uniqueVisitors)
      )
        throw new VisitorPingReadError(
          30 * 60_000,
          "Invalid VisitorPing country row",
        );
      const code =
        row.value.toUpperCase() === "UK" ? "GB" : row.value.toUpperCase();
      const countryCode = /^[A-Z]{2}$/.test(code) ? code : "ZZ";
      // Never sum independently deduplicated visitor counts if a provider returns duplicate groups.
      if (seen.has(countryCode))
        throw new VisitorPingReadError(
          30 * 60_000,
          "Duplicate VisitorPing country row",
        );
      seen.add(countryCode);
      return { countryCode, visitors: row.uniqueVisitors as number };
    })
    .sort(
      (a, b) =>
        b.visitors - a.visitors || a.countryCode.localeCompare(b.countryCode),
    );
  return {
    from,
    to,
    fetchedAt: Date.now(),
    historyDays,
    uniqueVisitors: totals.data.totals.uniqueVisitors,
    countries,
    truncated: geography.data.truncated,
  };
}
