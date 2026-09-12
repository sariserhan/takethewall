import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";
export async function GET() {
  try {
    // The backend query independently requires an allowlisted administrator.
    const backend = JSON.parse(await fetchAuthQuery(api.health.overview, {}));
    const missing = [
      "STRIPE_SECRET_KEY",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "RESEND_WEBHOOK_SECRET",
      "WALL_SERVER_SECRET",
      "WALL_TOKEN_SECRET",
    ].filter((key) => !process.env[key]?.trim());
    const mode =
      process.env.WALL_ENVIRONMENT === "production" ? "live" : "test";
    return Response.json(
      {
        ...backend,
        web: {
          missing,
          stripeMode: mode,
          stripeKeysMatchMode:
            new RegExp(`^(sk|rk)_${mode}_`).test(
              process.env.STRIPE_SECRET_KEY ?? "",
            ) &&
            (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").startsWith(
              `pk_${mode}_`,
            ),
          metricsEnabled:
            process.env.PUBLIC_METRICS_ENABLED === "true" &&
            process.env.WALL_ENVIRONMENT === "production" &&
            process.env.VERCEL_ENV === "production",
        },
        checkedAt: Date.now(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Health check unavailable. Sign in as an administrator and retry; if it persists, check backend logs.",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
