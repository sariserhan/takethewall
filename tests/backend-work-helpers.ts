import type { TestConvex } from "convex-test";
import type schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
type TestBackend = TestConvex<typeof schema>;
export async function flushAnalytics(t: TestBackend) {
  const batches = await t.run((ctx) =>
    ctx.db.query("analyticsBatches").collect(),
  );
  for (const batch of batches)
    await t.mutation(internal.analytics.flush, { id: batch._id });
}
// Drive the same single-message action used by scheduled delivery; do not advance
// unrelated claim deadlines or send future messages while testing one attempt.
export async function deliverDue(
  t: TestBackend,
  source: "jobs" | "mail" = "jobs",
) {
  const ids =
    source === "jobs"
      ? await t.query(internal.jobs.due, { now: Date.now() })
      : await t.query(internal.mail.due, {});
  for (const id of ids)
    await t.action(internal.delivery.deliver, { source, id });
}
