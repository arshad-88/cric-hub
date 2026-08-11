// ---------------------------------------------------------------------------
// scheduler.ts — server-side crons.
//
// The auction auto-pilot needs a background driver: when the host switches a
// room to AUTO-PILOT, this cron ticks every 10 seconds and calls
// auction.tickAllAutoPilot, which calls players, raises auto-bids for teams
// that enabled proxy bidding, sells when the clock runs out and moves on —
// all without an auctioneer tapping buttons.
// ---------------------------------------------------------------------------

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "auction-auto-pilot",
  { seconds: 10 },
  internal.auction.tickAllAutoPilot,
);

export default crons;
