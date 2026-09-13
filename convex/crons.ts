import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "email delivery recovery",
  { minutes: 15 },
  internal.delivery.recover,
  {},
);
crons.interval(
  "bounded cleanup and UTC rollover",
  { minutes: 5 },
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
  { minutes: 15 },
  internal.rewards.maintain,
  {},
);

crons.interval(
  "audit checkpoints",
  { minutes: 15 },
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
  { minutes: 15 },
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
  { hours: 1 },
  internal.recovery.indexContacts,
  {},
);
crons.interval(
  "wall subscriber notifications",
  { minutes: 15 },
  internal.wallSubscriptions.queue,
  {},
);
crons.interval(
  "email directory reconciliation",
  { hours: 1 },
  internal.emailDirectory.reconcile,
  {},
);
crons.interval(
  "resume contact deletions",
  { minutes: 15 },
  internal.contactManagement.resume,
  {},
);
crons.daily(
  "UTC date rollover",
  { hourUTC: 0, minuteUTC: 0 },
  internal.operations.cleanup,
  {},
);
crons.daily(
  "daily wall summaries",
  { hourUTC: 9, minuteUTC: 0 },
  internal.wallSubscriptions.queue,
  {},
);
crons.interval(
  "analytics recovery",
  { minutes: 15 },
  internal.analytics.recover,
  {},
);
crons.daily("Gazette draft", { hourUTC: 0, minuteUTC: 5 }, internal.community.midnight, {});
export default crons;
