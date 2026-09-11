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
export default crons;
