// ---------------------------------------------------------------------------
// TEMPORARY — automated end-to-end test. Creates a full dummy tournament
// (7 teams x 15 players), scores every ball of the league + knockouts through
// the REAL scoring mutations (startInnings / recordDelivery), exercising
// no-balls, free hits, wides, byes, leg-byes, run-outs (both ends), wickets,
// milestones and a tied match → super over. Deleted again after verification.
// ---------------------------------------------------------------------------

import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const USER_ID = "jx7evcdw7va0wwgjep42cxh6nh8c6rct" as Id<"users">;

const TEAMS = [
  { name: "Sunrise Strikers", shortCode: "SS", color: "#22c55e" },
  { name: "Palem Royals", shortCode: "PR", color: "#ef4444" },
  { name: "Velugodu Kings", shortCode: "VK", color: "#facc15" },
  { name: "Chennai Super Stars", shortCode: "CS", color: "#22d3ee" },
  { name: "Mumbai Mavericks", shortCode: "MM", color: "#3b82f6" },
  { name: "Delhi Dynamites", shortCode: "DD", color: "#f97316" },
  { name: "Bombay Bulls", shortCode: "BB", color: "#a78bfa" },
];

const FIRST = [
  "Aarav", "Vihaan", "Aditya", "Arjun", "Rohan", "Karthik", "Sai", "Nikhil",
  "Pranav", "Rahul", "Shiva", "Teja", "Varun", "Yash", "Ankit", "Dinesh",
  "Ganesh", "Harish", "Imran", "Kiran", "Manoj", "Naveen", "Pavan", "Ravi",
  "Sandeep", "Suresh", "Uday", "Vikram", "Bharath", "Charan",
];
const LAST = [
  "Reddy", "Naidu", "Rao", "Sharma", "Kumar", "Patel", "Gupta", "Varma",
  "Sastry", "Murthy", "Iyer", "Menon", "Das", "Nair", "Pillai", "Goud",
  "Chowdary", "Setty", "Raju", "Babu",
];
const BAT_HANDS = ["Right-hand bat", "Left-hand bat"] as const;
const BOWL_STYLES = [
  "Right-arm fast medium",
  "Right-arm off spin",
  "Leg spin",
  "Left-arm orthodox",
  "Left-arm medium fast",
] as const;

function makeName(i: number): string {
  return `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`;
}

function lcg(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface CtxLike {
  runMutation: (n: string, a: unknown) => Promise<Record<string, unknown>>;
  db: { query: (t: string) => unknown };
}

type DbQ = {
  withIndex: (n: string, q: (b: { eq: (k: string, v: string) => unknown }) => unknown) => DbQ;
  collect: () => Promise<Record<string, unknown>[]>;
};

function dbq(ctx: CtxLike, table: string): DbQ {
  return (ctx.db.query(table) as unknown as DbQ);
}

const R = (ctx: CtxLike, name: string, args: unknown) => ctx.runMutation(name, args);

async function squadOf(ctx: CtxLike, teamId: Id<"teams">): Promise<Id<"players">[]> {
  const rows = (await dbq(ctx, "players")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect()) as unknown as { _id: Id<"players">; _creationTime: number }[];
  rows.sort((a, b) => a._creationTime - b._creationTime);
  return rows.map((r) => r._id);
}

type BallSpec = {
  runsScored: number;
  extraType: "none" | "wide" | "noball" | "bye" | "legbye";
  extraRuns: number;
  isWicket: boolean;
  wicketType?: "Bowled" | "Caught" | "Run out" | "Stumped" | "LBW";
  dismissed?: "striker" | "nonStriker";
};

const ball = (runsScored: number): BallSpec => ({ runsScored, extraType: "none", extraRuns: 0, isWicket: false });
const wide = (extraRuns: number): BallSpec => ({ runsScored: 0, extraType: "wide", extraRuns, isWicket: false });
const noball = (runsScored: number): BallSpec => ({ runsScored, extraType: "noball", extraRuns: 1, isWicket: false });
const bye = (extraRuns: number): BallSpec => ({ runsScored: 0, extraType: "bye", extraRuns, isWicket: false });
const legbye = (extraRuns: number): BallSpec => ({ runsScored: 0, extraType: "legbye", extraRuns, isWicket: false });
const wicket = (type: "Bowled" | "Caught" | "Run out" | "Stumped" | "LBW", dismissed: "striker" | "nonStriker"): BallSpec => ({
  runsScored: 0,
  extraType: "none",
  extraRuns: 0,
  isWicket: true,
  wicketType: type,
  dismissed,
});

/** Innings-1 script: every edge case + a healthy team total (milestones). */
const INN1: (BallSpec | string)[] = [
  ball(4), ball(1), ball(4), ball(4), ball(6), ball(1), // over 1
  wide(1), ball(1), noball(0), ball(4), ball(1), ball(4), // over 2 — wide, no-ball, free-hit
  bye(2), ball(1), ball(2), ball(4), ball(6), ball(1), // over 3
  legbye(1), ball(1), ball(4), "runout-ns", ball(1), ball(1), // over 4
  ball(2), ball(6), ball(1), ball(4), ball(1), ball(2), // over 5
  "runout-s", ball(1), ball(6), ball(1), ball(2), ball(4), // over 6
  ball(2), ball(1), ball(1), ball(1), ball(1), ball(2), // over 7
  ball(1), ball(1), ball(1), "bowled", ball(1), ball(1), // over 8
  ball(1), "caught", ball(2), ball(4), ball(1), ball(1), // over 9
  ball(6), ball(1), ball(4), ball(2), ball(1), ball(4), // over 10
];

function genBall(
  mode: "normal" | "tie" | "super1" | "super2",
  inningsNo: number,
  over: number,
  ballNo: number,
  legalPos: number,
  deliveryNo: number,
  runs: number,
  wkts: number,
  target: number | null,
  rng: () => number,
): BallSpec {
  const pos = (over - 1) * 6 + ballNo; // legal-ball position

  // ---- tie script: identical level innings (55 each) → MATCH TIED ----
  if (mode === "tie") {
    if (over === 5 && ballNo === 1) return wicket("Bowled", "striker");
    if (pos % 12 === 0) return ball(0);
    return ball(1);
  }

  // ---- super over scripts (indexed by delivery, no extras) ----
  if (mode === "super1") {
    const seq = [ball(4), ball(6), ball(0), ball(1), ball(1), ball(4)];
    return seq[deliveryNo - 1] ?? ball(1);
  }
  if (mode === "super2") {
    const seq = [ball(6), ball(4), ball(1), ball(0), ball(4), ball(4)];
    return seq[deliveryNo - 1] ?? ball(1);
  }

  // ---- innings 1: the scripted edge-case over-by-over, indexed by delivery ----
  if (inningsNo === 1) {
    const s = INN1[deliveryNo - 1] as BallSpec | string | undefined;
    if (typeof s === "string") {
      if (s === "runout-ns") return wicket("Run out", "nonStriker");
      if (s === "runout-s") return wicket("Run out", "striker");
      if (s === "bowled") return wicket("Bowled", "striker");
      if (s === "caught") return wicket("Caught", "striker");
      return ball(0);
    }
    if (s) return s;
    // Script exhausted (shouldn't happen — backend completes at 60 legal).
    return ball(0);
  }

  // ---- innings 2: the chase ----
  const last = over === 10 && ballNo === 6;
  if (last) {
    const need = target == null ? 0 : target - runs;
    if (need >= 1 && need <= 6) return ball(need);
    if (need <= 0) return ball(0);
  }
  if (over === 5 && ballNo === 1) return wicket("Bowled", "striker");
  if (over === 8 && ballNo === 3) return wicket("Caught", "striker");
  if (over === 2 && ballNo === 2) return wide(1);
  if (over === 4 && ballNo === 4) return noball(0);
  if (over === 6 && ballNo === 5) return bye(1);
  if (over === 9 && ballNo === 4) return legbye(1);

  const ballsLeft = 60 - legalPos;
  const need = target == null ? 0 : Math.max(0, target - runs);
  const aggressive = need > ballsLeft * 1.4 || (ballsLeft > 0 && need / ballsLeft > 1.1);
  const r = rng();
  const table = aggressive
    ? [0.1, 0.22, 0.14, 0.05, 0.3, 0.19] // dot,1,2,3,4,6
    : [0.32, 0.3, 0.13, 0.04, 0.15, 0.06];
  let acc = 0;
  let runsScored = 0;
  for (let i = 0; i < 6; i++) {
    acc += table[i];
    if (r <= acc) {
      runsScored = i === 0 ? 0 : i === 1 ? 1 : i === 2 ? 2 : i === 3 ? 3 : i === 4 ? 4 : 6;
      break;
    }
  }
  if (runsScored === 0 && rng() < 0.03 && wkts < 9 && over < 10) {
    return wicket(rng() < 0.5 ? "LBW" : "Caught", "striker");
  }
  return ball(runsScored);
}

async function bowlInnings(
  ctx: CtxLike,
  matchId: Id<"matches">,
  inningsId: string,
  battingXi: Id<"players">[],
  bowlingSquad: Id<"players">[],
  opts: {
    mode: "normal" | "tie" | "super1" | "super2";
    inningsNo: number;
    target: number | null;
    seed: number;
  },
): Promise<{
  totalRuns: number;
  wickets: number;
  nextInningsId?: string;
  matchComplete?: boolean;
  superOver?: boolean;
  result?: string;
}> {
  const rng = lcg(opts.seed);
  let strikerIdx = 0;
  let nonStrikerIdx = 1;
  let nextIn = 2;
  let wkts = 0;
  let runs = 0;
  let over = 1;
  let ballNo = 1;
  let legalPos = 1; // legal-ball counter for the chase heuristics
  let deliveryNo = 1; // every recorded delivery (extras included)
  const maxWkts = opts.inningsNo >= 3 ? 2 : 10;
  let bowlerId = bowlingSquad[5];

  for (let i = 0; i < 300; i++) {
    const spec = genBall(opts.mode, opts.inningsNo, over, ballNo, legalPos, deliveryNo, runs, wkts, opts.target, rng);
    const batsmanId = battingXi[strikerIdx];
    const nonStrikerId = battingXi[nonStrikerIdx];
    let dismissedBatterId: Id<"players"> | undefined;
    let newBatsmanId: Id<"players"> | undefined;
    if (spec.isWicket) {
      dismissedBatterId = spec.dismissed === "nonStriker" ? nonStrikerId : batsmanId;
      if (wkts + 1 < 10 && nextIn < battingXi.length) {
        newBatsmanId = battingXi[nextIn++];
      }
    }
    const res = (await R(ctx, "scoring:recordDelivery", {
      matchId,
      inningsId,
      bowlerId,
      batsmanId,
      nonStrikerId,
      runsScored: spec.runsScored,
      extraType: spec.extraType,
      extraRuns: spec.extraRuns,
      isWicket: spec.isWicket,
      wicketType: spec.wicketType,
      dismissedBatterId,
      newBatsmanId,
    })) as Record<string, unknown>;

    if (spec.isWicket && newBatsmanId) {
      if (spec.dismissed === "nonStriker") nonStrikerIdx = nextIn - 1;
      else strikerIdx = nextIn - 1;
    }
    if (spec.runsScored % 2 === 1) {
      const t = strikerIdx;
      strikerIdx = nonStrikerIdx;
      nonStrikerIdx = t;
    }
    runs += spec.runsScored + spec.extraRuns;
    if (spec.isWicket) wkts += 1;
    deliveryNo += 1;
    if (spec.extraType === "none") {
      legalPos += 1;
      ballNo += 1;
      if (ballNo > 6) {
        ballNo = 1;
        over += 1;
        bowlerId = bowlingSquad[5 + ((over - 1) % 10)];
      }
    }
    if (wkts >= maxWkts) {
      // the backend would reject further balls; break out
      break;
    }
    if (res.inningsComplete || res.matchComplete) {
      return {
        totalRuns: runs,
        wickets: wkts,
        nextInningsId: res.nextInningsId as string | undefined,
        matchComplete: res.matchComplete as boolean | undefined,
        superOver: res.superOver as boolean | undefined,
        result: res.result as string | undefined,
      };
    }
  }
  throw new Error("Innings loop overrun — state mismatch");
}

/** Create the dummy world: tournament, 7 teams x 15 players, 7 league games. */
export const createWorld = mutation({
  args: {},
  handler: async (ctx) => {
    const tournamentId = await ctx.db.insert("tournaments", {
      name: "VPL Dummy Test Cup",
      year: 2026,
      description: "Automated end-to-end test — 7 teams, 10-over games",
      city: "Test Village",
      ballType: "Tennis",
      defaultOvers: 10,
      active: false,
      organizers: [USER_ID],
    });
    const teamIds: Id<"teams">[] = [];
    for (const t of TEAMS) {
      const teamId = await ctx.db.insert("teams", {
        tournamentId,
        name: t.name,
        shortCode: t.shortCode,
        color: t.color,
        coach: `Coach ${t.name.split(" ")[0]}`,
      });
      teamIds.push(teamId);
      for (let p = 0; p < 15; p++) {
        const role = p < 5 ? "Batsman" : p < 8 ? "All-rounder" : "Bowler";
        await ctx.db.insert("players", {
          teamId,
          name: makeName(teamIds.length * 31 + p),
          role: role as "Batsman",
          battingStyle: BAT_HANDS[p % 2],
          bowlingStyle:
            role === "Bowler" || role === "All-rounder"
              ? BOWL_STYLES[p % BOWL_STYLES.length]
              : undefined,
          jerseyNumber: p + 1,
        });
      }
    }
    const pairs: [number, number][] = [[0, 1], [2, 3], [4, 5], [6, 0], [1, 2], [3, 4], [5, 6]];
    const matchIds: Id<"matches">[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const [a, b] = pairs[i];
      matchIds.push(
        await ctx.db.insert("matches", {
          tournamentId,
          teamAId: teamIds[a],
          teamBId: teamIds[b],
          status: "UPCOMING",
          overs: 10,
          stage: "Group",
          startTime: Date.now() + i * 3_600_000,
          venue: "Test Ground",
        }),
      );
    }
    return { tournamentId, teamIds, matchIds };
  },
});

/** Score innings 1 of a match (one top-level transaction → fits read budget). */
export const scoreInnings1 = mutation({
  args: { matchId: v.id("matches"), seed: v.number() },
  handler: async (ctx, { matchId, seed }) => {
    const c = ctx as unknown as CtxLike;
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    const squadA = await squadOf(c, match.teamAId);
    const squadB = await squadOf(c, match.teamBId);
    const inn1 = (await R(c, "scoring:startInnings", {
      matchId,
      battingTeamId: match.teamAId,
      bowlingTeamId: match.teamBId,
      strikerId: squadA[0],
      nonStrikerId: squadA[1],
      bowlerId: squadB[5],
    })) as { inningsId: string };
    const r1 = await bowlInnings(c, matchId, inn1.inningsId, squadA, squadB, {
      mode: "normal",
      inningsNo: 1,
      target: null,
      seed,
    });
    return { matchId, inningsId: inn1.inningsId, nextInningsId: r1.nextInningsId, r1 };
  },
});

/** Score innings 2 (chase) of a match — separate transaction. */
export const scoreInnings2 = mutation({
  args: {
    matchId: v.id("matches"),
    inningsId: v.id("innings"),
    seed: v.number(),
    mode: v.optional(v.union(v.literal("normal"), v.literal("tie"))),
  },
  handler: async (ctx, { matchId, inningsId, seed, mode = "normal" }) => {
    const c = ctx as unknown as CtxLike;
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    const squadA = await squadOf(c, match.teamAId);
    const squadB = await squadOf(c, match.teamBId);
    const inn2 = await ctx.db.get(inningsId);
    const r2 = await bowlInnings(c, matchId, inningsId, squadB, squadA, {
      mode,
      inningsNo: 2,
      target: (inn2?.target ?? null) as number | null,
      seed: seed + 1,
    });

    if (r2.superOver) {
      // Super over 1 — the side that batted second bats first (started manually)
      const so1 = (await R(c, "scoring:startInnings", {
        matchId,
        battingTeamId: match.teamBId,
        bowlingTeamId: match.teamAId,
        strikerId: squadB[0],
        nonStrikerId: squadB[1],
        bowlerId: squadA[5],
      })) as { inningsId: string };
      const so1r = await bowlInnings(c, matchId, so1.inningsId, squadB, squadA, {
        mode: "super1",
        inningsNo: 3,
        target: null,
        seed: seed + 2,
      });
      // Super over 2 — the first-innings side chases (auto-created)
      if (!so1r.nextInningsId) throw new Error("Backend did not auto-create super over 2");
      const so2r = await bowlInnings(c, matchId, so1r.nextInningsId, squadA, squadB, {
        mode: "super2",
        inningsNo: 4,
        target: so1r.totalRuns + 1,
        seed: seed + 3,
      });
      return { matchId, r2, superOver: { so1r, so2r } };
    }
    return { matchId, r2 };
  },
});

async function winnerOf(ctx: CtxLike, matchId: Id<"matches">): Promise<Id<"teams">> {
  const rows = (await dbq(ctx, "innings")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .collect()) as unknown as {
    number: number;
    battingTeamId: Id<"teams">;
    totalRuns: number;
  }[];
  const in1 = rows.find((i) => i.number === 1);
  const in2 = rows.find((i) => i.number === 2);
  if (!in1 || !in2) throw new Error("Innings missing");
  if (in2.totalRuns > in1.totalRuns) return in2.battingTeamId;
  if (in1.totalRuns > in2.totalRuns) return in1.battingTeamId;
  const in3 = rows.find((i) => i.number === 3);
  const in4 = rows.find((i) => i.number === 4);
  if (in3 && in4) return in4.totalRuns > in3.totalRuns ? in4.battingTeamId : in3.battingTeamId;
  throw new Error("Cannot determine winner");
}

/** After the league: top 4 → two semi-finals. */
export const scheduleKnockouts = mutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const c = ctx as unknown as CtxLike;
    const lb = (await R(c, "leaderboard:get", { tournamentId })) as {
      pointsTable?: { team: { _id: Id<"teams"> } }[];
    };
    const top4 = (lb?.pointsTable ?? []).slice(0, 4).map((r) => r.team._id);
    if (top4.length !== 4) throw new Error("Not enough completed league games");
    const semi1 = await ctx.db.insert("matches", {
      tournamentId,
      teamAId: top4[0],
      teamBId: top4[3],
      status: "UPCOMING",
      overs: 10,
      stage: "Semi-final",
      startTime: Date.now() + 48 * 3_600_000,
      venue: "Semi Ground",
    });
    const semi2 = await ctx.db.insert("matches", {
      tournamentId,
      teamAId: top4[1],
      teamBId: top4[2],
      status: "UPCOMING",
      overs: 10,
      stage: "Semi-final",
      startTime: Date.now() + 48 * 3_600_000,
      venue: "Semi Ground",
    });
    return { semi1, semi2, top4 };
  },
});

/** After the semis: winners meet in the final. */
export const createFinal = mutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const c = ctx as unknown as CtxLike;
    const matches = (await dbq(c, "matches")
      .withIndex("by_tournament_status", (q) => q.eq("tournamentId", tournamentId))
      .collect()) as unknown as {
      _id: Id<"matches">;
      stage?: string;
      status: string;
    }[];
    const semis = matches.filter((m) => m.stage === "Semi-final" && m.status === "COMPLETED");
    if (semis.length !== 2) throw new Error("Both semi-finals must be complete");
    const winners = await Promise.all(semis.map((m) => winnerOf(c, m._id)));
    return ctx.db.insert("matches", {
      tournamentId,
      teamAId: winners[0],
      teamBId: winners[1],
      status: "UPCOMING",
      overs: 10,
      stage: "Final",
      startTime: Date.now() + 96 * 3_600_000,
      venue: "Final Ground",
    });
  },
});
