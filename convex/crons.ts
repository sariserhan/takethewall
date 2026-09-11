import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval("delivery outbox", { minutes: 1 }, internal.jobs.dispatch, {});
crons.interval(
  "bounded cleanup and UTC rollover",
  { minutes: 1 },
  internal.operations.cleanup,
  {},
);
crons.interval(
  "VisitorPing aggregate report",
  { seconds: 30 },
  internal.visitorping.refresh,
  {},
);
crons.interval(
  "reward maintenance",
  { minutes: 1 },
  internal.rewards.maintain,
  {},
);
crons.interval(
  "transactional email",
  { minutes: 1 },
  internal.mail.dispatch,
  {},
);
crons.interval(
  "audit checkpoints",
  { minutes: 1 },
  internal.auditTrail.checkpoint,
  {},
);
crons.interval(
  "external audit anchoring",
  { minutes: 5 },
  internal.anchoring.submit,
  {},
);
export default crons;
