import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

/** Public, real owner only: previews never apply admin demo overrides. */
export async function livePreviewOwner() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  try {
    const client = new ConvexHttpClient(url, {
      logger: false,
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        }),
    });
    const data = await client.query(api.wall.current, {});
    if (!data?.owner || data.owner.kind === "initial_house") return null;
    const displayName = (data.owner.displayName || data.owner.domain).trim();
    if (!displayName) return null;
    return {
      displayName: displayName.slice(0, 100),
      takeoverNumber: data.owner.takeoverNumber,
    };
  } catch {
    // A crawler must still receive a useful image during a backend outage.
    return null;
  }
}
