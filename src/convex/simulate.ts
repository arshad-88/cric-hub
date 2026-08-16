// ---------------------------------------------------------------------------
// simulate.ts — end-to-end tournament simulator (review tooling only).
//
// Drives the REAL scoring engine (the same `*Internal` cores behind the
// scorer UI) ball-by-ball through a full tournament: 7 teams × 15-player
// squads, league stage (2 matches per team), two semi-finals and a final —
// all 10-over matches. After every single delivery it re-verifies the
// engine's state (crease, over/ball numbering, totals) and reports any
// problem found, so bugs surface automatically instead of at validation.
//
// Actions cannot touch the database directly, so all reads/writes go through
// the small internal functions below; the match loop itself runs in the
// `simulateMatch` action (10-minute action timeout, no transaction limits).
//
// Usage (from the CLI, against the deployment):
//   bunx convex run simulate:setup --args '{"overs":10,"organizerEmail":"..."}'
//   bunx convex run simulate:simulateMatch --args '{"matchId":"..."}'
//   bunx convex run simulate:createKnockout --args '{...}'
//
// The data this creates is REAL tournament data on the live backend — clear
// it afterwards with:  bunx convex run seed:reset
// ---------------------------------------------------------------------------

import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { EXTRA_TYPE, WICKET_TYPE } from "./schema";
import type { ExtraType, WicketType } from "./schema";
import { isLegalBall } from "./cricket";

// ---- deterministic RNG (reproducible runs) ---------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ---- team / player catalog --------------------------------------------------

const TEAM_DEFS = [
  { name: "Warriors", code: "WAR", color: "#f59e0b" },
  { name: "Titans", code: "TIT", color: "#8b5cf6" },
  { name: "Rising Stars", code: "RIS", color: "#06b6d4" },
  { name: "Kings XI", code: "KXI", color: "#ef4444" },
  { name: "Super Giants", code: "SUG", color: "#22c55e" },
  { name: "Royal Challengers", code: "ROY", color: "#3b82f6" },
  { name: "Thunderbolts", code: "THU", color: "#f43f5e" },
] as const;

const FIRST_NAMES = [
  "Arshad", "Ravi", "Suresh", "Mahesh", "Vikram", "Kiran", "Ajay", "Naveen",
  "Sai", "Rohit", "Prakash", "Vijay", "Anil", "Karthik", "Deepak",
] as const;
const LAST_NAMES = ["Kumar", "Reddy", "Naidu", "Rao", "Sharma", "Patel", "Singh"] as const;

function playerName(index: number): string {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${first} ${last}`;
}

const BOWLING_STYLES = [
  "Right-arm medium",
  "Right-arm fast",
  "Right-arm off spin",
  "Left-arm orthodox",
  "Leg spin",
  "Left-arm medium",
] as const;

const SHOT_REGIONS = [
  "cover", "mid-off", "long-on", "midwicket", "fine-leg", "third-man",
  "square-leg", "deep-midwicket", "long-off", "point", "extra-cover", "straight",
] as const;
const SHOT_TYPES = ["drive", "cut", "pull", "sweep", "lofted", "flick", "push"] as const;

// ---------------------------------------------------------------------------
// INTERNAL QUERIES — the only way the action loop can read the database
// ---------------------------------------------------------------------------

export const getMatchBundle = internalQuery({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    if (!match) return null;
    const [teamA, teamB] = await Promise.all([
      ctx.db.get(match.teamAId),
      ctx.db.get(match.teamBId),
    ]);
    return { match, teamA, teamB };
  },
});

export const getSquad = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    return [...players].sort((a, b) => (a.jerseyNumber ?? 99) - (b.jerseyNumber ?? 99));
  },
});

/** Innings row + its newest delivery — one call per ball for verification. */
export const getBallState = internalQuery({
  args: { inningsId: v.id("innings") },
  handler: async (ctx, { inningsId }) => {
    const innings = await ctx.db.get(inningsId);
    const lastDelivery = await ctx.db
      .query("deliveries")
      .withIndex("by_innings", (q) => q.eq("inningsId", inningsId))
      .order("desc")
      .first();
    return { innings, lastDelivery };
  },
});

/** Final reconciliation bundle: match + every innings with its deliveries. */
export const getMatchSummary = internalQuery({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    const rows = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const innings = [];
    for (const inn of rows) {
      const ds = await ctx.db
        .query("deliveries")
        .withIndex("by_innings", (q) => q.eq("inningsId", inn._id))
        .collect();
      innings.push({
        id: inn._id,
        number: inn.number,
        totalRuns: inn.totalRuns,
        wickets: inn.wickets,
        ballsBowled: inn.ballsBowled,
        deliveries: ds,
      });
    }
    return { match, innings };
  },
});

// ---------------------------------------------------------------------------
// SETUP — tournament + 7 teams × 15 players + league fixtures (2 each)
// ---------------------------------------------------------------------------

export const setup = internalMutation({
  args: {
    overs: v.optional(v.number()),
    organizerEmail: v.optional(v.string()),
  },
  handler: async (ctx, { overs, organizerEmail }) => {
    const totalOvers = overs ?? 10;

    // The user's own account becomes the tournament organizer (if it exists)
    // so they can also open the scorer for any of these matches.
    let organizerId: Id<"users"> | undefined;
    if (organizerEmail) {
      const u = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", organizerEmail))
        .first();
      if (u) organizerId = u._id;
    }

    // Un-feature any previous active tournament; this one becomes the active.
    const actives = await ctx.db
      .query("tournaments")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    for (const t of actives) await ctx.db.patch(t._id, { active: false });

    const now = Date.now();
    const base = new Date();
    base.setHours(18, 0, 0, 0);

    const tournamentId = await ctx.db.insert("tournaments", {
      name: "VPL CricHub Season 1",
      year: 2026,
      description:
        "Simulated full tournament — 7 teams, 10-over matches, league stage plus knockouts. Built to review every scorecard edge case.",
      city: "Ggv",
      ballType: "Tennis",
      startDate: now - 86400000,
      endDate: now + 3 * 86400000,
      defaultOvers: totalOvers,
      active: true,
      organizers: organizerId ? [organizerId] : [],
    });

    const teamIds: Id<"teams">[] = [];
    for (const td of TEAM_DEFS) {
      teamIds.push(
        await ctx.db.insert("teams", {
          tournamentId,
          name: td.name,
          shortCode: td.code,
          color: td.color,
        }),
      );
    }

    // 15-player squads: 7 batsmen, 2 all-rounders, 6 bowlers (jersey 1-15;
    // jersey 1-11 are the playing XI, jersey 1 the captain).
    for (let t = 0; t < teamIds.length; t++) {
      const teamId = teamIds[t];
      const playerIds: Id<"players">[] = [];
      for (let i = 0; i < 15; i++) {
        const role = i < 7 ? "Batsman" : i < 9 ? "All-rounder" : "Bowler";
        const battingStyle = i % 4 === 0 ? "Left-hand bat" : "Right-hand bat";
        const bowlingStyle =
          role === "Batsman" ? undefined : BOWLING_STYLES[i % BOWLING_STYLES.length];
        playerIds.push(
          await ctx.db.insert("players", {
            teamId,
            name: playerName(t * 15 + i),
            role,
            battingStyle,
            bowlingStyle,
            jerseyNumber: i + 1,
            isPlayingXI: i < 11,
            isCaptain: i === 0,
          }),
        );
      }
      await ctx.db.patch(teamId, { captainId: playerIds[0] });
    }

    // League fixtures — a cycle so every team plays exactly 2 matches.
    const pairs = [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 0],
      [1, 2],
      [3, 4],
      [5, 6],
    ] as const;
    const venues = ["Ggv", "VPL Ground 2", "Town Oval", "College Ground"];
    const matchIds: Id<"matches">[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const [a, b] = pairs[i];
      matchIds.push(
        await ctx.db.insert("matches", {
          tournamentId,
          teamAId: teamIds[a],
          teamBId: teamIds[b],
          status: "UPCOMING",
          overs: totalOvers,
          venue: venues[i % venues.length],
          stage: "Group",
          startTime: base.getTime() + i * 2 * 3600000,
        }),
      );
    }

    return {
      tournamentId,
      teamIds,
      matchIds,
      organizer: organizerId ? String(organizerId) : null,
      overs: totalOvers,
    };
  },
});

// ---------------------------------------------------------------------------
// CREATE KNOCKOUT — one or more fixtures (semi-finals / final)
// ---------------------------------------------------------------------------

export const createKnockout = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    fixtures: v.array(
      v.object({
        teamAId: v.id("teams"),
        teamBId: v.id("teams"),
        stage: v.union(
          v.literal("Group"),
          v.literal("Quarter-final"),
          v.literal("Semi-final"),
          v.literal("Final"),
        ),
        startTime: v.number(),
      }),
    ),
  },
  handler: async (ctx, { tournamentId, fixtures }) => {
    const ids: Id<"matches">[] = [];
    for (const f of fixtures) {
      if (f.teamAId === f.teamBId) throw new Error("A team cannot play itself.");
      ids.push(
        await ctx.db.insert("matches", {
          tournamentId,
          teamAId: f.teamAId,
          teamBId: f.teamBId,
          status: "UPCOMING",
          overs: 10,
          venue: "Ggv",
          stage: f.stage,
          startTime: f.startTime,
        }),
      );
    }
    return { matchIds: ids };
  },
});

/** Grant organizer rights on a tournament (for review access to the scorer). */
export const addOrganizers = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    userIds: v.array(v.id("users")),
  },
  handler: async (ctx, { tournamentId, userIds }) => {
    const t = await ctx.db.get(tournamentId);
    if (!t) throw new Error("Tournament not found");
    const orgs = [...new Set([...(t.organizers ?? []), ...userIds])];
    await ctx.db.patch(tournamentId, { organizers: orgs });
    return orgs;
  },
});

/** Record the toss on a match (action cannot write directly). */
export const applyToss = internalMutation({
  args: {
    matchId: v.id("matches"),
    tossWinnerId: v.id("teams"),
    tossDecision: v.union(v.literal("bat"), v.literal("bowl")),
  },
  handler: async (ctx, { matchId, tossWinnerId, tossDecision }) => {
    await ctx.db.patch(matchId, { tossWinnerId, tossDecision });
  },
});

// ---------------------------------------------------------------------------
// MATCH SIMULATION — ball-by-ball through the real scoring engine
// ---------------------------------------------------------------------------

function battingOrder(
  squad: { _id: Id<"players">; jerseyNumber?: number }[],
  rng: () => number,
): Id<"players">[] {
  const xi = squad.slice(0, 11).map((p) => p._id);
  const openers = xi.slice(0, 2);
  const rest = shuffle(xi.slice(2), rng);
  return [...openers, ...rest];
}

function pickBowler(
  bowlers: Id<"players">[],
  previous: Id<"players"> | null,
  rng: () => number,
): Id<"players"> {
  const candidates = bowlers.filter((b) => b !== previous);
  if (candidates.length > 0) return pick(candidates, rng);
  return pick(bowlers, rng);
}

function pickWicketType(rng: () => number, freeHit: boolean): WicketType {
  if (freeHit) return WICKET_TYPE.RUN_OUT;
  const r = rng();
  if (r < 0.4) return WICKET_TYPE.CAUGHT;
  if (r < 0.64) return WICKET_TYPE.BOWLED;
  if (r < 0.8) return WICKET_TYPE.LBW;
  if (r < 0.91) return WICKET_TYPE.RUN_OUT;
  return WICKET_TYPE.STUMPED;
}

interface BallInput {
  striker: Id<"players">;
  nonStriker: Id<"players">;
  bowler: Id<"players">;
  fielders: Id<"players">[];
  nextBatter: Id<"players"> | null;
  outCount: number; // wickets before this ball
  freeHit: boolean;
  rng: () => number;
}

interface BallPlan {
  runsScored: number;
  extraType: ExtraType;
  extraRuns: number;
  isWicket: boolean;
  wicketType?: WicketType;
  dismissedBatterId?: Id<"players">;
  fielderId?: Id<"players">;
  newBatsmanId?: Id<"players">;
  shotRegion?: string;
  shotType?: string;
}

/** Realistic ball generator (T10 pace: plenty of boundaries, some wickets). */
function genBall(input: BallInput): BallPlan {
  const { striker, nonStriker, bowler, fielders, nextBatter, outCount, freeHit, rng } = input;
  const r = rng();

  const shot = (runs: number): { shotRegion?: string; shotType?: string } => {
    if (runs === 4 || runs === 6) {
    return {
      shotRegion: pick([...SHOT_REGIONS], rng),
      shotType: runs === 6 ? "lofted" : pick([...SHOT_TYPES], rng),
    };
    }
    if (rng() < 0.4) {
      return { shotRegion: pick([...SHOT_REGIONS], rng), shotType: pick([...SHOT_TYPES], rng) };
    }
    return {};
  };

  // Wicket
  if (r < 0.07) {
    const wicketType = pickWicketType(rng, freeHit);
    const runOutNonStriker = wicketType === WICKET_TYPE.RUN_OUT && rng() < 0.5;
    const dismissedBatterId = runOutNonStriker ? nonStriker : striker;
    const outCountAfter = outCount + 1;
    const newBatsmanId = outCountAfter < 10 ? (nextBatter ?? undefined) : undefined;
    let fielderId: Id<"players"> | undefined;
    if (wicketType === WICKET_TYPE.CAUGHT) {
      fielderId = rng() < 0.08 ? bowler : pick(fielders, rng);
    } else if (wicketType === WICKET_TYPE.STUMPED || wicketType === WICKET_TYPE.RUN_OUT) {
      fielderId = pick(fielders, rng);
    }
    return {
      runsScored: 0,
      extraType: EXTRA_TYPE.NONE,
      extraRuns: 0,
      isWicket: true,
      wicketType,
      dismissedBatterId,
      fielderId,
      newBatsmanId,
    };
  }

  // Wide
  if (r < 0.115) {
    return {
      runsScored: 0,
      extraType: EXTRA_TYPE.WIDE,
      extraRuns: rng() < 0.85 ? 1 : 2,
      isWicket: false,
    };
  }

  // No-ball (free hit comes next)
  if (r < 0.15) {
    const runs = rng() < 0.5 ? 0 : rng() < 0.55 ? 1 : rng() < 0.75 ? 2 : rng() < 0.9 ? 4 : 6;
    return {
      runsScored: runs,
      extraType: EXTRA_TYPE.NOBALL,
      extraRuns: 1,
      isWicket: false,
      ...shot(runs),
    };
  }

  // Bye / leg-bye
  if (r < 0.16) {
    return {
      runsScored: 0,
      extraType: rng() < 0.5 ? EXTRA_TYPE.BYE : EXTRA_TYPE.LEGBYE,
      extraRuns: rng() < 0.7 ? 1 : 2,
      isWicket: false,
    };
  }

  // Regular runs
  const runs =
    r < 0.42 ? 0 : r < 0.7 ? 1 : r < 0.8 ? 2 : r < 0.82 ? 3 : r < 0.94 ? 4 : 6;
  return {
    runsScored: runs,
    extraType: EXTRA_TYPE.NONE,
    extraRuns: 0,
    isWicket: false,
    ...shot(runs),
  };
}

interface InningsReport {
  number: number;
  runs: number;
  wickets: number;
  balls: number;
  target: number | null;
  boundaries: number;
  extras: { wide: number; noball: number; bye: number; legbye: number };
  fallOfWickets: { over: string; batterId: string; type: string }[];
}

interface PlayResult {
  inningsComplete: boolean;
  nextInningsId?: Id<"innings">;
  superOver?: boolean;
  matchComplete?: boolean;
  result?: string | null;
  report: InningsReport;
  undo: { ok: boolean; note: string } | null;
}

interface PlayOpts {
  matchId: Id<"matches">;
  inningsId: Id<"innings">;
  number: number;
  order: Id<"players">[];
  bowlers: Id<"players">[];
  fielders: Id<"players">[];
  initialBowler: Id<"players">;
  isSuperOver: boolean;
  undoTest: boolean;
  rng: () => number;
  problems: string[];
}

async function playInnings(ctx: ActionCtx, opts: PlayOpts): Promise<PlayResult> {
  const {
    matchId,
    inningsId,
    number,
    order,
    bowlers,
    fielders,
    initialBowler,
    isSuperOver,
    undoTest,
    rng,
    problems,
  } = opts;

  let striker = order[0];
  let nonStriker = order[1];
  let nextIndex = 2;
  let outCount = 0;
  let legalInOver = 0;
  let currentOver = 1;
  let bowler = initialBowler;
  let lastWasNoBall = false;
  let ballsRecorded = 0;
  let undoDone = false;
  let undoResult: { ok: boolean; note: string } | null = null;

  const fallOfWickets: InningsReport["fallOfWickets"] = [];
  let boundaries = 0;
  const extras = { wide: 0, noball: 0, bye: 0, legbye: 0 };
  const maxBalls = isSuperOver ? 6 : 60;

  for (;;) {
    if (ballsRecorded > 400) {
      problems.push(`innings ${number}: loop runaway (${ballsRecorded} balls)`);
      break;
    }

    // New over → rotate the bowler (never two in a row).
    if (legalInOver === 0 && ballsRecorded > 0) {
      bowler = pickBowler(bowlers, bowler, rng);
      await ctx.runMutation(internal.scoring.setBowlerInternal, {
        inningsId,
        bowlerId: bowler,
      });
    }

    const expectedOver = currentOver;
    const expectedBall = legalInOver + 1;
    const freeHit = lastWasNoBall;

    const plan = genBall({
      striker,
      nonStriker,
      bowler,
      fielders,
      nextBatter: nextIndex < order.length ? order[nextIndex] : null,
      outCount,
      freeHit,
      rng,
    });

    const args: {
      matchId: Id<"matches">;
      inningsId: Id<"innings">;
      bowlerId: Id<"players">;
      batsmanId: Id<"players">;
      nonStrikerId: Id<"players">;
      runsScored: number;
      extraType: ExtraType;
      extraRuns: number;
      isWicket: boolean;
      wicketType?: WicketType;
      dismissedBatterId?: Id<"players">;
      fielderId?: Id<"players">;
      newBatsmanId?: Id<"players">;
      shotRegion?: string;
      shotType?: string;
    } = {
      matchId,
      inningsId,
      bowlerId: bowler,
      batsmanId: striker,
      nonStrikerId: nonStriker,
      runsScored: plan.runsScored,
      extraType: plan.extraType,
      extraRuns: plan.extraRuns,
      isWicket: plan.isWicket,
      ...(plan.wicketType ? { wicketType: plan.wicketType } : {}),
      ...(plan.dismissedBatterId ? { dismissedBatterId: plan.dismissedBatterId } : {}),
      ...(plan.fielderId ? { fielderId: plan.fielderId } : {}),
      ...(plan.newBatsmanId ? { newBatsmanId: plan.newBatsmanId } : {}),
      ...(plan.shotRegion ? { shotRegion: plan.shotRegion } : {}),
      ...(plan.shotType ? { shotType: plan.shotType } : {}),
    };

    let res: {
      ok?: boolean;
      inningsComplete?: boolean;
      nextInningsId?: Id<"innings">;
      superOver?: boolean;
      matchComplete?: boolean;
      result?: string | null;
    };
    try {
      res = await ctx.runMutation(internal.scoring.recordDeliveryInternal, args);
    } catch (e) {
      problems.push(
        `innings ${number} over ${expectedOver}.${expectedBall}: recordDelivery threw — ${e instanceof Error ? e.message : String(e)}`,
      );
      break;
    }
    ballsRecorded += 1;
    if (plan.extraType === EXTRA_TYPE.NOBALL) extras.noball += plan.extraRuns;
    if (plan.extraType === EXTRA_TYPE.WIDE) extras.wide += plan.extraRuns;
    if (plan.extraType === EXTRA_TYPE.BYE) extras.bye += plan.extraRuns;
    if (plan.extraType === EXTRA_TYPE.LEGBYE) extras.legbye += plan.extraRuns;
    if (plan.runsScored === 4 || plan.runsScored === 6) boundaries += 1;

    // ---- verify the engine's state after this ball -------------------------
    const ballState: {
      innings: Doc<"innings"> | null;
      lastDelivery: Doc<"deliveries"> | null;
    } = await ctx.runQuery(internal.simulate.getBallState, { inningsId });
    const innAfter = ballState.innings;
    const last = ballState.lastDelivery;
    if (!innAfter) {
      problems.push(`innings ${number}: row disappeared`);
      break;
    }
    // Over/ball numbering must match the engine's assignment.
    if (!last || last.overNumber !== expectedOver || last.ballNumber !== expectedBall) {
      problems.push(
        `innings ${number}: numbering mismatch — expected ${expectedOver}.${expectedBall}, engine wrote ${last ? `${last.overNumber}.${last.ballNumber}` : "none"}`,
      );
    }
    // Crease must match replayCrease semantics.
    let es = striker;
    let en = nonStriker;
    if (plan.isWicket && plan.newBatsmanId) {
      if (plan.dismissedBatterId === en) en = plan.newBatsmanId;
      else es = plan.newBatsmanId;
    }
    const rotateBy =
      plan.runsScored +
      (plan.extraType === EXTRA_TYPE.BYE || plan.extraType === EXTRA_TYPE.LEGBYE
        ? plan.extraRuns
        : 0);
    if (rotateBy % 2 === 1) {
      const t = es;
      es = en;
      en = t;
    }
    if (innAfter.strikerId !== es || innAfter.nonStrikerId !== en) {
      problems.push(
        `innings ${number}: crease mismatch after ${expectedOver}.${expectedBall} — engine ${String(innAfter.strikerId)}/${String(innAfter.nonStrikerId)}, expected ${String(es)}/${String(en)}`,
      );
    }

    // ---- advance local state (mirrors replayCrease) -------------------------
    if (plan.isWicket) {
      outCount += 1;
      if (plan.newBatsmanId) {
        if (plan.dismissedBatterId === nonStriker) nonStriker = plan.newBatsmanId;
        else striker = plan.newBatsmanId;
      }
      nextIndex = Math.min(nextIndex + 1, order.length);
      fallOfWickets.push({
        over: `${expectedOver}.${expectedBall}`,
        batterId: String(plan.dismissedBatterId ?? striker),
        type: plan.wicketType ?? "?",
      });
    }
    if (rotateBy % 2 === 1) {
      const t = striker;
      striker = nonStriker;
      nonStriker = t;
    }
    if (isLegalBall(plan.extraType)) {
      legalInOver += 1;
      if (legalInOver === 6) {
        legalInOver = 0;
        currentOver += 1;
      }
    }
    lastWasNoBall = plan.extraType === EXTRA_TYPE.NOBALL;

    // ---- undo test: undo + verify + re-score the 6th legal ball ------------
    if (undoTest && !undoDone && !isSuperOver && innAfter.ballsBowled === 6) {
      undoDone = true;
      const preState: {
        innings: Doc<"innings"> | null;
        lastDelivery: Doc<"deliveries"> | null;
      } = await ctx.runQuery(internal.simulate.getBallState, { inningsId });
      const beforeRuns = preState.innings?.totalRuns ?? 0;
      const beforeWkts = preState.innings?.wickets ?? 0;
      const beforeBalls = preState.innings?.ballsBowled ?? 0;
      const beforeStriker = preState.innings?.strikerId ?? null;
      const beforeNonStriker = preState.innings?.nonStrikerId ?? null;

      try {
        await ctx.runMutation(internal.scoring.undoLastDeliveryInternal, {
          matchId,
          inningsId,
        });
      } catch (e) {
        problems.push(
          `innings ${number}: undo threw — ${e instanceof Error ? e.message : String(e)}`,
        );
        break;
      }
      const rolledBack: Doc<"innings"> | null = (
        await ctx.runQuery(internal.simulate.getBallState, { inningsId })
      ).innings;
      const okRollback =
        rolledBack &&
        rolledBack.totalRuns === beforeRuns &&
        rolledBack.wickets === beforeWkts &&
        rolledBack.ballsBowled === beforeBalls &&
        rolledBack.strikerId === beforeStriker &&
        rolledBack.nonStrikerId === beforeNonStriker;
      if (!okRollback) {
        problems.push(
          `innings ${number}: undo rollback mismatch (runs ${rolledBack?.totalRuns}/${beforeRuns}, wkts ${rolledBack?.wickets}/${beforeWkts}, balls ${rolledBack?.ballsBowled}/${beforeBalls})`,
        );
      }

      // Re-score the exact same ball.
      const re = await ctx
        .runMutation(internal.scoring.recordDeliveryInternal, args)
        .catch((e) => {
          problems.push(
            `innings ${number}: re-score after undo threw — ${e instanceof Error ? e.message : String(e)}`,
          );
          return null;
        });
      if (re) {
        const reInn: Doc<"innings"> | null = (
          await ctx.runQuery(internal.simulate.getBallState, { inningsId })
        ).innings;
        if (
          reInn &&
          (reInn.totalRuns !== innAfter.totalRuns ||
            reInn.wickets !== innAfter.wickets ||
            reInn.ballsBowled !== innAfter.ballsBowled)
        ) {
          problems.push(
            `innings ${number}: re-score did not restore state (${reInn.totalRuns}/${reInn.wickets}/${reInn.ballsBowled} vs ${innAfter.totalRuns}/${innAfter.wickets}/${innAfter.ballsBowled})`,
          );
        }
        if (reInn && (reInn.strikerId !== es || reInn.nonStrikerId !== en)) {
          problems.push(`innings ${number}: re-score crease mismatch`);
        }
      }
      undoResult = okRollback
        ? { ok: true, note: "undo + re-score of the 6th legal ball verified" }
        : { ok: false, note: "undo rollback did not match" };
    }

    if (res.inningsComplete) {
      const report = reportOf(
        number,
        innAfter,
        innAfter.target ?? null,
        boundaries,
        extras,
        fallOfWickets,
      );
      if (res.superOver) {
        return { inningsComplete: true, superOver: true, report, undo: undoResult };
      }
      if (res.matchComplete) {
        return {
          inningsComplete: true,
          matchComplete: true,
          result: res.result,
          report,
          undo: undoResult,
        };
      }
      if (res.nextInningsId) {
        return {
          inningsComplete: true,
          nextInningsId: res.nextInningsId,
          report,
          undo: undoResult,
        };
      }
    }
  }

  const finalState: {
    innings: Doc<"innings"> | null;
    lastDelivery: Doc<"deliveries"> | null;
  } = await ctx.runQuery(internal.simulate.getBallState, { inningsId });
  return {
    inningsComplete: false,
    report: finalState.innings
      ? reportOf(
          number,
          finalState.innings,
          finalState.innings.target ?? null,
          boundaries,
          extras,
          fallOfWickets,
        )
      : {
          number,
          runs: 0,
          wickets: 0,
          balls: 0,
          target: null,
          boundaries,
          extras,
          fallOfWickets,
        },
    undo: undoResult,
  };
}

function reportOf(
  number: number,
  inn: { totalRuns: number; wickets: number; ballsBowled: number; target?: number | null },
  target: number | null,
  boundaries: number,
  extras: { wide: number; noball: number; bye: number; legbye: number },
  fallOfWickets: { over: string; batterId: string; type: string }[],
): InningsReport {
  return {
    number,
    runs: inn.totalRuns,
    wickets: inn.wickets,
    balls: inn.ballsBowled,
    target,
    boundaries,
    extras,
    fallOfWickets,
  };
}

// ---------------------------------------------------------------------------
// SIMULATE ONE MATCH — toss → innings 1 → chase → (super over) → result
// ---------------------------------------------------------------------------

interface SimMatchReport {
  matchId: Id<"matches">;
  status: string;
  result: string | null;
  toss: { winner: string; decision: "bat" | "bowl" };
  superOver: boolean;
  innings: InningsReport[];
  undo: { ok: boolean; note: string } | null;
  problems: string[];
}

export const simulateMatch = action({
  args: { matchId: v.id("matches"), undoTest: v.optional(v.boolean()) },
  handler: async (ctx, { matchId, undoTest }): Promise<SimMatchReport> => {
    const bundle: {
      match: Doc<"matches">;
      teamA: Doc<"teams"> | null;
      teamB: Doc<"teams"> | null;
    } | null = await ctx.runQuery(internal.simulate.getMatchBundle, { matchId });
    if (!bundle) throw new Error("Match not found");
    const { match, teamA, teamB } = bundle;
    if (match.status !== "UPCOMING") {
      throw new Error(`Match is ${match.status}, not UPCOMING — cannot simulate.`);
    }
    if (!teamA || !teamB) throw new Error("Teams missing");

    const rng = mulberry32(hashSeed(matchId) ^ 0x9e3779b9);
    const problems: string[] = [];

    const squadA: Doc<"players">[] = await ctx.runQuery(internal.simulate.getSquad, {
      teamId: teamA._id,
    });
    const squadB: Doc<"players">[] = await ctx.runQuery(internal.simulate.getSquad, {
      teamId: teamB._id,
    });
    const orderA = battingOrder(squadA, rng);
    const orderB = battingOrder(squadB, rng);
    const bowlersA = squadA
      .filter((p) => p.role === "Bowler" || p.role === "All-rounder")
      .map((p) => p._id);
    const bowlersB = squadB
      .filter((p) => p.role === "Bowler" || p.role === "All-rounder")
      .map((p) => p._id);
    const fieldersA = squadA.slice(0, 11).map((p) => p._id);
    const fieldersB = squadB.slice(0, 11).map((p) => p._id);
    if (bowlersA.length === 0 || bowlersB.length === 0) {
      throw new Error("A squad has no bowlers — cannot simulate.");
    }

    // Toss
    const tossWinnerId = rng() < 0.5 ? teamA._id : teamB._id;
    const tossDecision: "bat" | "bowl" = rng() < 0.5 ? "bat" : "bowl";
    await ctx.runMutation(internal.simulate.applyToss, {
      matchId,
      tossWinnerId,
      tossDecision,
    });
    const batFirstId =
      tossDecision === "bat" ? tossWinnerId : tossWinnerId === teamA._id ? teamB._id : teamA._id;
    const chaseId = batFirstId === teamA._id ? teamB._id : teamA._id;
    const side = (id: Id<"teams">) =>
      id === teamA._id
        ? { order: orderA, bowlers: bowlersA, fielders: fieldersA }
        : { order: orderB, bowlers: bowlersB, fielders: fieldersB };
    const batFirst = side(batFirstId);
    const chase = side(chaseId);

    // ---- innings 1 (batFirst bat, chase bowl) --------------------------------
    const firstBowlerA = pickBowler(chase.bowlers, null, rng);
    const in1: { inningsId: Id<"innings">; number: number } =
      await ctx.runMutation(internal.scoring.startInningsInternal, {
        matchId,
        battingTeamId: batFirstId,
        bowlingTeamId: chaseId,
        strikerId: batFirst.order[0],
        nonStrikerId: batFirst.order[1],
        bowlerId: firstBowlerA,
      });

    const r1 = await playInnings(ctx, {
      matchId,
      inningsId: in1.inningsId,
      number: 1,
      order: batFirst.order,
      bowlers: chase.bowlers,
      fielders: chase.fielders,
      initialBowler: firstBowlerA,
      isSuperOver: false,
      undoTest: undoTest ?? false,
      rng,
      problems,
    });
    if (!r1.inningsComplete || !r1.nextInningsId) {
      throw new Error(`Innings 1 did not complete: ${problems.join("; ")}`);
    }

    // ---- innings 2 (chase bat, batFirst bowl) --------------------------------
    const firstBowlerB = pickBowler(batFirst.bowlers, null, rng);
    await ctx.runMutation(internal.scoring.setOpenersAndBowlerInternal, {
      inningsId: r1.nextInningsId,
      strikerId: chase.order[0],
      nonStrikerId: chase.order[1],
      bowlerId: firstBowlerB,
    });
    const r2 = await playInnings(ctx, {
      matchId,
      inningsId: r1.nextInningsId,
      number: 2,
      order: chase.order,
      bowlers: batFirst.bowlers,
      fielders: batFirst.fielders,
      initialBowler: firstBowlerB,
      isSuperOver: false,
      undoTest: false,
      rng,
      problems,
    });

    let result: string | null | undefined = r2.result;
    let superOverUsed = false;

    // ---- tie → super over -----------------------------------------------------
    if (r2.superOver) {
      superOverUsed = true;
      const soBowlerA = pickBowler(batFirst.bowlers, null, rng);
      const in3: { inningsId: Id<"innings">; number: number } =
        await ctx.runMutation(internal.scoring.startInningsInternal, {
          matchId,
          battingTeamId: chaseId, // the side that batted second bats first
          bowlingTeamId: batFirstId,
          strikerId: chase.order[0],
          nonStrikerId: chase.order[1],
          bowlerId: soBowlerA,
        });
      const r3 = await playInnings(ctx, {
        matchId,
        inningsId: in3.inningsId,
        number: 3,
        order: chase.order,
        bowlers: batFirst.bowlers,
        fielders: batFirst.fielders,
        initialBowler: soBowlerA,
        isSuperOver: true,
        undoTest: false,
        rng,
        problems,
      });
      if (!r3.inningsComplete || !r3.nextInningsId) {
        throw new Error(`Super over 1 did not complete: ${problems.join("; ")}`);
      }
      const soBowlerB = pickBowler(chase.bowlers, null, rng);
      await ctx.runMutation(internal.scoring.setOpenersAndBowlerInternal, {
        inningsId: r3.nextInningsId,
        strikerId: batFirst.order[0],
        nonStrikerId: batFirst.order[1],
        bowlerId: soBowlerB,
      });
      const r4 = await playInnings(ctx, {
        matchId,
        inningsId: r3.nextInningsId,
        number: 4,
        order: batFirst.order,
        bowlers: chase.bowlers,
        fielders: chase.fielders,
        initialBowler: soBowlerB,
        isSuperOver: true,
        undoTest: false,
        rng,
        problems,
      });
      result = r4.result;
      if (!r4.matchComplete && !result) {
        problems.push("Super over did not produce a result");
      }
    }

    // ---- final reconciliation (single source of truth check) ----------------
    const summary: {
      match: Doc<"matches"> | null;
      innings: {
        id: Id<"innings">;
        number: number;
        totalRuns: number;
        wickets: number;
        ballsBowled: number;
        deliveries: Doc<"deliveries">[];
      }[];
    } = await ctx.runQuery(internal.simulate.getMatchSummary, { matchId });
    for (const inn of summary.innings) {
      const sumRuns = inn.deliveries.reduce((s, d) => s + d.totalRuns, 0);
      const wkts = inn.deliveries.filter((d) => d.isWicket).length;
      const legal = inn.deliveries.filter((d) => isLegalBall(d.extraType)).length;
      if (inn.totalRuns !== sumRuns)
        problems.push(`innings ${inn.number}: totalRuns ${inn.totalRuns} != deliveries ${sumRuns}`);
      if (inn.wickets !== wkts)
        problems.push(`innings ${inn.number}: wickets ${inn.wickets} != deliveries ${wkts}`);
      if (inn.ballsBowled !== legal)
        problems.push(`innings ${inn.number}: ballsBowled ${inn.ballsBowled} != legal ${legal}`);
    }
    const finalMatch = summary.match;
    if (!finalMatch || finalMatch.status !== "COMPLETED") {
      problems.push(`match did not finish COMPLETED (${finalMatch?.status ?? "missing"})`);
    }
    if (finalMatch && !finalMatch.result) {
      problems.push("match completed without a result line");
    }

    return {
      matchId,
      status: finalMatch?.status ?? "?",
      result: finalMatch?.result ?? result ?? null,
      toss: {
        winner: tossWinnerId === teamA._id ? teamA.name : teamB.name,
        decision: tossDecision,
      },
      superOver: superOverUsed,
      innings: [r1.report, r2.report],
      undo: r1.undo,
      problems,
    };
  },
});
