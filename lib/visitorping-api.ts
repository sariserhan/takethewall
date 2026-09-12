/** Server-side aggregate reader. Never import into a client component. */
export class VisitorPingReadError extends Error {
  constructor(
    public readonly retryAfterMs: number,
    message: string,
  ) {
    super(message);
  }
}

export async function readVisitorPingTotals(args: {
  apiKey: string;
  siteId: string;
  takeoverId: string;
  event: "wall_impression" | "wall_owner_link_click";
  from: string;
  to: string;
}) {
  const url = new URL(
    `https://visitorping.com/api/v1/sites/${encodeURIComponent(args.siteId)}/analytics`,
  );
  url.search = new URLSearchParams({
    from: args.from,
    to: args.to,
    interval: "hour",
    // These custom events are relayed by Convex after application traffic checks.
    // Provider bot classification describes the relay server, not the visitor.
    traffic: "all",
    event: args.event,
    property: "takeoverId",
    value: args.takeoverId,
  }).toString();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${args.apiKey}` },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const seconds = Number(response.headers.get("Retry-After"));
    const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
    throw new VisitorPingReadError(
      Math.max(
        delay,
        response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
          ? 900_000
          : 60_000,
      ),
      `VisitorPing HTTP ${response.status}`,
    );
  }
  const body = await response.json();
  const totals = body?.data?.totals;
  if (
    body?.apiVersion !== "1" ||
    body?.site?.id !== args.siteId ||
    Date.parse(body?.range?.from) !== Date.parse(args.from) ||
    Date.parse(body?.range?.to) !== Date.parse(args.to) ||
    !Number.isSafeInteger(totals?.events) ||
    totals.events < 0 ||
    !Number.isSafeInteger(totals?.uniqueVisitors) ||
    totals.uniqueVisitors < 0
  )
    throw new VisitorPingReadError(
      60_000,
      "Invalid VisitorPing aggregate response",
    );
  return {
    events: totals.events as number,
    uniqueVisitors: totals.uniqueVisitors as number,
  };
}
