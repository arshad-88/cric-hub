// ---------------------------------------------------------------------------
// cricket.ts — pure cricket domain logic (no Convex I/O).
// Encoding of the Laws of Cricket for community T20 leagues, used by the
// scoring mutations, the seed simulator and all read-side aggregations so
// every surface derives stats from a single source of truth.
// ---------------------------------------------------------------------------

import { EXTRA_TYPE, WICKET_TYPE } from "./schema";
import type { ExtraType, WicketType } from "./schema";
import type { Id } from "./_generated/dataModel";

export interface DeliveryLike {
  overNumber: number;
  ballNumber: number;
  bowlerId: Id<"players">;
  batsmanId: Id<"players">;
  nonStrikerId?: Id<"players">;
  runsScored: number;
  extraType: ExtraType;
  extraRuns: number;
  totalRuns: number;
  isWicket: boolean;
  wicketType?: WicketType;
  dismissedBatterId?: Id<"players">;
  fielderId?: Id<"players">;
  newBatsmanId?: Id<"players">;
}

export interface InningsTotals {
  battingTeamId: Id<"teams">;
  totalRuns: number;
  wickets: number;
  ballsBowled: number;
  target?: number;
}

export type BallKind =
  | "dot"
  | "runs"
  | "boundary"
  | "wicket"
  | "extra"
  | "bye"
  | "wide";

// ---- overs / rates --------------------------------------------------------

/** "13.0" style overs display from a count of legal balls. */
export function formatOvers(balls: number): string {
  const completed = Math.floor(balls / 6);
  const rem = balls % 6;
  return `${completed}.${rem}`;
}

/** Runs per over. */
export function runRate(runs: number, balls: number): number {
  if (balls <= 0) return 0;
  return Number((runs / (balls / 6)).toFixed(2));
}

/** Required run rate for the chasing side; null when not applicable. */
export function requiredRunRate(
  target: number | undefined,
  runs: number,
  totalOvers: number,
  ballsBowled: number,
): number | null {
  if (target == null) return null;
  const ballsLeft = totalOvers * 6 - ballsBowled;
  if (ballsLeft <= 0) return null;
  const need = target - runs;
  if (need <= 0) return 0;
  return Number((need / (ballsLeft / 6)).toFixed(2));
}

export function isLegalBall(extraType: ExtraType): boolean {
  return (
    extraType === EXTRA_TYPE.NONE ||
    extraType === EXTRA_TYPE.BYE ||
    extraType === EXTRA_TYPE.LEGBYE
  );
}

export function isInningsComplete(
  wickets: number,
  ballsBowled: number,
  totalOvers: number,
): boolean {
  return wickets >= 10 || ballsBowled >= totalOvers * 6;
}

/** Bowler gets the wicket for every dismissal except run-outs. */
export function bowlerCredited(d: DeliveryLike): boolean {
  return d.isWicket && d.wicketType !== WICKET_TYPE.RUN_OUT;
}

// ---- result computation ---------------------------------------------------

export function matchWinnerTeamId(
  in1: InningsTotals,
  in2: InningsTotals | null,
): string | null {
  if (!in2) return null;
  const target = in2.target ?? in1.totalRuns + 1;
  if (in2.totalRuns >= target) return in2.battingTeamId;
  if (in2.totalRuns === in1.totalRuns) return null; // tie
  return in1.battingTeamId;
}

/** "Warriors won by 23 runs" — full result line for the public page. */
export function computeMatchResult(
  teamNames: { batting1: string; batting2: string },
  in1: InningsTotals,
  in2: InningsTotals | null,
): string | null {
  if (!in2) return null;
  const target = in2.target ?? in1.totalRuns + 1;
  if (in2.totalRuns >= target) {
    return `${teamNames.batting2} won by ${10 - in2.wickets} wicket${
      10 - in2.wickets === 1 ? "" : "s"
    }`;
  }
  if (in2.totalRuns === in1.totalRuns) return "Match tied";
  const margin = in1.totalRuns - in2.totalRuns;
  return `${teamNames.batting1} won by ${margin} run${margin === 1 ? "" : "s"}`;
}

// ---- ball symbols + commentary --------------------------------------------

export function buildBallSymbol(
  d: DeliveryLike,
): { symbol: string; kind: BallKind } {
  if (d.isWicket) return { symbol: "W", kind: "wicket" };
  if (d.extraType === EXTRA_TYPE.WIDE) {
    const suffix = d.extraRuns > 1 ? `+${d.extraRuns - 1}` : "";
    return { symbol: `Wd${suffix}`, kind: "wide" };
  }
  if (d.extraType === EXTRA_TYPE.NOBALL) {
    const suffix = d.runsScored > 0 ? `+${d.runsScored}` : "";
    return { symbol: `Nb${suffix}`, kind: "extra" };
  }
  if (d.extraType === EXTRA_TYPE.BYE) {
    return { symbol: d.extraRuns > 1 ? `B+${d.extraRuns}` : "B", kind: "bye" };
  }
  if (d.extraType === EXTRA_TYPE.LEGBYE) {
    return {
      symbol: d.extraRuns > 1 ? `LB+${d.extraRuns}` : "LB",
      kind: "bye",
    };
  }
  if (d.runsScored === 0) return { symbol: "0", kind: "dot" };
  if (d.runsScored === 4 || d.runsScored === 6)
    return { symbol: `${d.runsScored}`, kind: "boundary" };
  return { symbol: `${d.runsScored}`, kind: "runs" };
}

interface CommentaryNames {
  bowler: string;
  batsman: string;
  dismissed?: string;
  fielder?: string;
}

export function buildCommentary(d: DeliveryLike, names: CommentaryNames): string {
  const lead =
    d.extraType === EXTRA_TYPE.WIDE
      ? "Wide ball — "
      : d.extraType === EXTRA_TYPE.NOBALL
        ? "No-ball — "
        : "";

  if (d.isWicket) {
    const victim = names.dismissed ?? names.batsman;
    let how: string;
    switch (d.wicketType) {
      case WICKET_TYPE.BOWLED:
        how = `b ${names.bowler}`;
        break;
      case WICKET_TYPE.CAUGHT:
        how = names.fielder
          ? `c ${names.fielder} b ${names.bowler}`
          : `c & b ${names.bowler}`;
        break;
      case WICKET_TYPE.STUMPED:
        how = names.fielder ? `st ${names.fielder} b ${names.bowler}` : `st b ${names.bowler}`;
        break;
      case WICKET_TYPE.LBW:
        how = `lbw b ${names.bowler}`;
        break;
      case WICKET_TYPE.RUN_OUT:
      default:
        how = names.fielder ? `run out (${names.fielder})` : "run out";
        break;
    }
    return `${lead}OUT! ${victim} ${how}`;
  }

  if (d.extraType === EXTRA_TYPE.WIDE) {
    return `${lead}${d.extraRuns} extra${d.extraRuns > 1 ? "s" : ""} conceded`;
  }
  if (d.extraType === EXTRA_TYPE.NOBALL) {
    if (d.runsScored > 0)
      return `${lead}${d.runsScored} run${d.runsScored > 1 ? "s" : ""} to ${names.batsman} (free-hit next ball)`;
    return `${lead}1 extra — free-hit next ball`;
  }
  if (d.extraType === EXTRA_TYPE.BYE) {
    return `${d.extraRuns} bye${d.extraRuns > 1 ? "s" : ""} to ${names.bowler}`;
  }
  if (d.extraType === EXTRA_TYPE.LEGBYE) {
    return `${d.extraRuns} leg-bye${d.extraRuns > 1 ? "s" : ""} to ${names.bowler}`;
  }
  if (d.runsScored === 0) return `${names.bowler} to ${names.batsman}, no run`;
  if (d.runsScored === 4)
    return `FOUR! ${names.batsman} finds the boundary`;
  if (d.runsScored === 6) return `SIX! ${names.batsman} clears the rope`;
  return `${d.runsScored} run${d.runsScored > 1 ? "s" : ""} to ${names.batsman}`;
}

// ---- crease state (replayable so undo stays correct) ----------------------

/**
 * Reconstructs striker/non-striker after a sequence of deliveries.
 * Rules: odd runs (incl. byes/leg-byes) rotate strike; a new over swaps ends;
 * a wicket brings `newBatsmanId` (the replacement) to the striker's end.
 */
export function replayCrease(
  deliveries: DeliveryLike[],
  openingStrikerId?: Id<"players">,
  openingNonStrikerId?: Id<"players">,
): { strikerId?: Id<"players">; nonStrikerId?: Id<"players"> } {
  let striker = openingStrikerId;
  let nonStriker = openingNonStrikerId;
  let prevOver = 0;
  for (const d of deliveries) {
    if (d.overNumber !== prevOver && prevOver !== 0 && striker && nonStriker) {
      const t = striker;
      striker = nonStriker;
      nonStriker = t;
    }
    if (d.isWicket) striker = d.newBatsmanId ?? striker;
    const rotateBy =
      d.runsScored +
      (d.extraType === EXTRA_TYPE.BYE || d.extraType === EXTRA_TYPE.LEGBYE
        ? d.extraRuns
        : 0);
    if (rotateBy % 2 === 1 && striker && nonStriker) {
      const t = striker;
      striker = nonStriker;
      nonStriker = t;
    }
    prevOver = d.overNumber;
  }
  return { strikerId: striker, nonStrikerId: nonStriker };
}

// ---- batter / bowler aggregates -------------------------------------------

export interface BatterAgg {
  playerId: Id<"players">;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissal: {
    wicketType: WicketType;
    bowlerId?: Id<"players">;
    fielderId?: Id<"players">;
  } | null;
}

export function aggregateBatterStats(
  deliveries: DeliveryLike[],
): Map<Id<"players">, BatterAgg> {
  const map = new Map<Id<"players">, BatterAgg>();
  const ensure = (playerId: Id<"players">): BatterAgg => {
    let e = map.get(playerId);
    if (!e) {
      e = {
        playerId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dismissal: null,
      };
      map.set(playerId, e);
    }
    return e;
  };
  for (const d of deliveries) {
    const e = ensure(d.batsmanId);
    // Wide: no ball faced and no bat runs. No-ball: no ball faced (batter runs
    // still credit to the striker, matching career.ts which uses isLegalBall).
    if (isLegalBall(d.extraType)) e.balls += 1;
    e.runs += d.runsScored;
    if (d.runsScored === 4) e.fours += 1;
    if (d.runsScored === 6) e.sixes += 1;
    if (d.isWicket && d.dismissedBatterId === d.batsmanId) {
      e.dismissal = {
        wicketType: d.wicketType ?? WICKET_TYPE.RUN_OUT,
        bowlerId: d.bowlerId,
        fielderId: d.fielderId,
      };
    }
  }
  return map;
}

export interface BowlerAgg {
  playerId: Id<"players">;
  balls: number;
  runs: number;
  wickets: number;
  maidens: number;
}

export function aggregateBowlerStats(
  deliveries: DeliveryLike[],
): Map<Id<"players">, BowlerAgg> {
  const map = new Map<Id<"players">, BowlerAgg>();
  const ensure = (playerId: Id<"players">): BowlerAgg => {
    let e = map.get(playerId);
    if (!e) {
      e = { playerId, balls: 0, runs: 0, wickets: 0, maidens: 0 };
      map.set(playerId, e);
    }
    return e;
  };
  // Per-over tracking for maiden detection. An over is a maiden when it had
  // exactly 6 legal balls and conceded 0 runs. In this scoring flow one bowler
  // bowls a full over (ball numbering restarts per over), so the maiden is
  // credited to the bowler who bowled it — tracking per over number (instead
  // of per bowler) avoids counting bogus maidens when a bowler's partial overs
  // from different overs happen to sum to 6 balls.
  const overStats = new Map<
    number,
    { balls: number; runs: number; bowlerId: Id<"players"> }
  >();
  for (const d of deliveries) {
    const e = ensure(d.bowlerId);
    const legal = isLegalBall(d.extraType);
    if (legal) e.balls += 1;
    e.runs += d.totalRuns;
    if (bowlerCredited(d)) e.wickets += 1;

    let o = overStats.get(d.overNumber);
    if (!o) {
      o = { balls: 0, runs: 0, bowlerId: d.bowlerId };
      overStats.set(d.overNumber, o);
    }
    if (legal) o.balls += 1;
    o.runs += d.totalRuns;
  }
  for (const o of overStats.values()) {
    if (o.balls === 6 && o.runs === 0) {
      const e = map.get(o.bowlerId);
      if (e) e.maidens += 1;
    }
  }
  return map;
}

// ---- per-over breakdown ---------------------------------------------------

export interface OverBallView {
  symbol: string;
  kind: BallKind;
}

export interface OverView {
  over: number;
  runs: number;
  wickets: number;
  legalBalls: number;
  balls: OverBallView[];
}

/** Runs, wickets and ball symbols grouped by over (for the Overs tab). */
export function aggregateOvers(deliveries: DeliveryLike[]): OverView[] {
  const map = new Map<number, Omit<OverView, "over">>();
  for (const d of deliveries) {
    let o = map.get(d.overNumber);
    if (!o) {
      o = { runs: 0, wickets: 0, legalBalls: 0, balls: [] };
      map.set(d.overNumber, o);
    }
    o.runs += d.totalRuns;
    if (d.isWicket) o.wickets += 1;
    if (isLegalBall(d.extraType)) o.legalBalls += 1;
    o.balls.push(buildBallSymbol(d));
  }
  return [...map.entries()]
    .map(([over, v]) => ({ over, ...v }))
    .sort((a, b) => a.over - b.over);
}

/** Net run rate — overs all-out count as the full allocation. */
export function teamNRR(
  runsFor: number,
  ballsFor: number,
  runsAgainst: number,
  ballsAgainst: number,
): number {
  if (ballsFor <= 0 || ballsAgainst <= 0) return 0;
  const rFor = runsFor / (ballsFor / 6);
  const rAg = runsAgainst / (ballsAgainst / 6);
  return Number((rFor - rAg).toFixed(3));
}
