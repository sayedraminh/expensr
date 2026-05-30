import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync plaid transactions",
  { hours: 6 },
  internal.plaid.syncAllConnectedItems,
  {}
);

crons.interval(
  "sync stripe revenue",
  { hours: 6 },
  internal.stripe.syncAllConnectedConnections,
  {}
);

export default crons;
