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
  { minutes: 15 },
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
crons.weekly(
  "current owner weekly digest",
  { dayOfWeek: "monday", hourUTC: 9, minuteUTC: 0 },
  internal.owners.queueWeeklyDigest,
  {},
);
crons.interval(
  "milestone subscriber alerts",
  { minutes: 1 },
  internal.milestoneAlerts.queue,
  {},
);
crons.daily(
  "expired milestone signups",
  { hourUTC: 3, minuteUTC: 0 },
  internal.milestoneAlerts.cleanup,
  {},
);
crons.interval(
  "index recovery contacts",
  { minutes: 1 },
  internal.recovery.indexContacts,
  {},
);
crons.interval(
  "wall subscriber notifications",
  { minutes: 1 },
  internal.wallSubscriptions.queue,
  {},
);
crons.interval(
  "email directory reconciliation",
  { minutes: 5 },
  internal.emailDirectory.reconcile,
  {},
);
crons.interval(
  "resume contact deletions",
  { minutes: 1 },
  internal.contactManagement.resume,
  {},
);
export default crons;
