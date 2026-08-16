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

/** Extra match context the scorer feeds in so commentary reads like a broadcast. */
export interface CommentaryContext {
  overLabel?: string;
  teamRuns?: number;
  teamWickets?: number;
  target?: number | null;
  ballsLeft?: number;
  partnershipRuns?: number;
  isMaiden?: boolean; // over just completed as a maiden
  isHatTrickBall?: boolean;
  dotsBefore?: number; // consecutive dots before this ball
  freeHit?: boolean;
  projectedScore?: number;
}

/** Deterministic pick from a template list — varies without repeating. */
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function seedOf(d: DeliveryLike): number {
  let h = d.overNumber * 31 + d.ballNumber * 17;
  h = (h * 31 + d.batsmanId.length) % 100000;
  return h;
}

const SIX_OPENERS = ["SIX!", "MAXIMUM!", "HUGE!", "ALL THE WAY!", "GONE! SIX!"];
const SIX_LINES = [
  "{batsman} launches it high over the ropes.",
  "{batsman} stands tall and smokes it into the stands.",
  "Excellent connection and that's maximum!",
  "{batsman} picks the length early and deposits it over the fence.",
  "Clean strike — the crowd erupts!",
];
const FOUR_LINES = [
  "{batsman} finds the gap and it races to the rope.",
  "Beautifully timed through the off side.",
  "{batsman} caresses it past the fielder for four.",
  "Short and punished — four more!",
  "{batsman} threads it through the covers perfectly.",
];
const WICKET_LINES = [
  "The big fish is gone!",
  "The partnership is finally broken.",
  "The dressing room is stunned.",
  "Massive moment in this contest!",
  "What a breakthrough for {bowler}!",
];
const CHASE_LINES = [
  "The pressure is beginning to build on the bowling side.",
  "The required rate is starting to look very gettable.",
  "Momentum swinging with every boundary.",
  "The equation keeps getting simpler for the chase.",
];
const DEFENCE_LINES = [
  "{batsman} defends it solidly.",
  "Beaten! That one just missed the edge.",
  "{bowler} nails the yorker — {batsman} digs it out.",
  "No run — good disciplined bowling.",
  "{batsman} pushes it to cover. Dot ball.",
];

/** Fill {batsman} / {bowler} placeholders inside a picked commentary line. */
function fillTpl(line: string, names: CommentaryNames): string {
  return line
    .replace(/\{batsman\}/g, names.batsman)
    .replace(/\{bowler\}/g, names.bowler)
    .replace(/\{dismissed\}/g, names.dismissed ?? names.batsman)
    .replace(/\{fielder\}/g, names.fielder ?? "the fielder");
}

/**
 * Broadcast-style ball commentary. Templates vary per event and insert the
 * over/ball, batter, bowler, runs, score, target and partnership context.
 */
export function buildCommentary(
  d: DeliveryLike,
  names: CommentaryNames,
  ctx?: CommentaryContext,
): string {
  const seed = seedOf(d);
  const over = ctx?.overLabel ?? `${d.overNumber}.${d.ballNumber}`;
  const score =
    ctx?.teamRuns != null && ctx?.teamWickets != null
      ? `${ctx.teamRuns}/${ctx.teamWickets}`
      : null;

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
    const flair = ctx?.isHatTrickBall
      ? ""
      : pick(WICKET_LINES, seed + d.overNumber);
    const hat = ctx?.isHatTrickBall ? "Two down in two — the hat-trick is on!" : "";
    const parts = [`OUT! ${victim} ${how}.`];
    if (flair) parts.push(fillTpl(flair, names));
    if (hat) parts.push(hat);
    if (score) parts.push(`${score} now.`);
    return parts.join(" ");
  }

  if (d.extraType === EXTRA_TYPE.WIDE) {
    const extra = d.extraRuns > 1 ? `${d.extraRuns - 1} more running — ${d.extraRuns} wide${d.extraRuns > 1 ? "s" : ""}` : "a wide";
    return `${over} — ${extra}${d.extraRuns > 1 ? " in total" : ""}${score ? ` · ${score}` : ""}.`;
  }
  if (d.extraType === EXTRA_TYPE.NOBALL) {
    if (d.runsScored > 0)
      return `${over} — No-ball! ${d.runsScored} run${d.runsScored > 1 ? "s" : ""} to ${names.batsman}${ctx?.freeHit ? " · free-hit next ball" : ""}${score ? ` · ${score}` : ""}.`;
    return `${over} — No-ball called. The free hit is coming${score ? ` · ${score}` : ""}.`;
  }
  if (d.extraType === EXTRA_TYPE.BYE) {
    return `${over} — ${d.extraRuns} bye${d.extraRuns > 1 ? "s" : ""}${score ? ` · ${score}` : ""}.`;
  }
  if (d.extraType === EXTRA_TYPE.LEGBYE) {
    return `${over} — ${d.extraRuns} leg-bye${d.extraRuns > 1 ? "s" : ""}${score ? ` · ${score}` : ""}.`;
  }
  if (d.runsScored === 0) {
    const dots = ctx?.dotsBefore ? ` ${ctx.dotsBefore + 1} dots on the trot` : "";
    return `${over} — ${fillTpl(pick(DEFENCE_LINES, seed), names)}${dots}.`;
  }
  if (d.runsScored === 4) {
    const chaseCtx =
      ctx?.target != null && ctx?.teamRuns != null && ctx?.ballsLeft != null
        ? { target: ctx.target, teamRuns: ctx.teamRuns, ballsLeft: ctx.ballsLeft }
        : null;
    const line = `${over} — FOUR! ${fillTpl(pick(FOUR_LINES, seed), names)}`;
    return chaseCtx && chaseCtx.teamRuns + 4 >= chaseCtx.target * 0.75
      ? `${line} ${pick(CHASE_LINES, seed)}`
      : line;
  }
  if (d.runsScored === 6) {
    return `${over} — ${pick(SIX_OPENERS, seed)} ${fillTpl(pick(SIX_LINES, seed), names)}`;
  }
  if (d.runsScored === 3) {
    return `${over} — ${names.batsman} opens the face and they run hard — three!`;
  }
  return `${over} — ${d.runsScored} run${d.runsScored > 1 ? "s" : ""} to ${names.batsman}${score ? ` · ${score}` : ""}.`;
}

// ---------------------------------------------------------------------------
// MVP (Player of the Match) scoring model — clearly specified + configurable.
// ---------------------------------------------------------------------------

/**
 * Weights behind the MVP score. Every term is explicit so league owners can
 * tune the model (see DEFAULT_MVP_CONFIG and the `mvpConfig` settings key).
 *   - runs × runPoint
 *   - strike-rate bonus: (SR − srTarget) × srBonusPerPoint, only when SR > target
 *   - boundary bonus: (fours + sixes) × boundaryBonus
 *   - wickets × wicketPoint
 *   - economy bonus: (econTarget − econ) × 10 × econBonusPerPoint, only when
 *     the bowler has bowled and economy is better than target
 *   - maidens × maidenBonus; catches/run-outs/stumpings at their point values
 *   - winning side gets a × winningBonus multiplier (match-winning contribution)
 */
export interface MvpConfig {
  runPoint: number;
  srTarget: number;
  srBonusPerPoint: number;
  boundaryBonus: number;
  wicketPoint: number;
  econTarget: number;
  econBonusPerPoint: number;
  maidenBonus: number;
  catchPoint: number;
  runOutPoint: number;
  stumpingPoint: number;
  winningBonus: number;
}

export const DEFAULT_MVP_CONFIG: MvpConfig = {
  runPoint: 1,
  srTarget: 120,
  srBonusPerPoint: 0.25,
  boundaryBonus: 0.5,
  wicketPoint: 25,
  econTarget: 7.5,
  econBonusPerPoint: 1.5,
  maidenBonus: 5,
  catchPoint: 8,
  runOutPoint: 12,
  stumpingPoint: 10,
  winningBonus: 1.1,
};

export interface MvpPlayerInput {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  wickets: number;
  runsConceded: number;
  ballsBowled: number;
  maidens: number;
  catches: number;
  runOuts: number;
  stumpings: number;
  teamWon: boolean;
}

export function computeMvpScore(
  input: MvpPlayerInput,
  config: MvpConfig = DEFAULT_MVP_CONFIG,
): number {
  let score = input.runs * config.runPoint;
  const sr = input.balls > 0 ? (input.runs / input.balls) * 100 : 0;
  if (sr > config.srTarget) {
    score += (sr - config.srTarget) * config.srBonusPerPoint;
  }
  score += (input.fours + input.sixes) * config.boundaryBonus;
  score += input.wickets * config.wicketPoint;
  const econ = input.ballsBowled > 0 ? input.runsConceded / (input.ballsBowled / 6) : 0;
  if (input.ballsBowled > 0 && econ < config.econTarget) {
    score += (config.econTarget - econ) * 10 * config.econBonusPerPoint;
  }
  score += input.maidens * config.maidenBonus;
  score += input.catches * config.catchPoint;
  score += input.runOuts * config.runOutPoint;
  score += input.stumpings * config.stumpingPoint;
  if (input.teamWon) score *= config.winningBonus;
  return Math.round(score * 10) / 10;
}

// ---- milestone helpers -----------------------------------------------------

export const BATTER_MILESTONES = [25, 50, 75, 100, 150, 200] as const;
export const TEAM_MILESTONES = [50, 100, 150, 200, 250] as const;
export const PARTNERSHIP_MILESTONES = [50, 100, 150] as const;
export const BOWLER_HAULS = [3, 4, 5, 6] as const;

export function reachedMilestone(
  milestones: readonly number[],
  before: number,
  after: number,
): number | null {
  for (const m of milestones) {
    if (before < m && after >= m) return m;
  }
  return null;
}

/** True when the last `n` consecutive legal deliveries by this bowler were wickets. */
export function isHatTrick(
  deliveries: { bowlerId: string; isWicket: boolean; extraType: ExtraType; overNumber: number; ballNumber: number }[],
): boolean {
  const seq = deliveries.slice(-3);
  if (seq.length < 3) return false;
  const bowler = seq[seq.length - 1].bowlerId;
  return seq.every(
    (d) => d.bowlerId === bowler && d.isWicket && isLegalBall(d.extraType),
  );
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
    if (d.isWicket && d.newBatsmanId) {
      // The replacement batter takes the crease of the DISMISSED batter. For
      // a run-out of the non-striker the striker keeps strike — putting the
      // new batter straight into the striker slot would rotate the wrong way.
      if (d.dismissedBatterId && nonStriker && d.dismissedBatterId === nonStriker) {
        nonStriker = d.newBatsmanId;
      } else {
        striker = d.newBatsmanId;
      }
    }
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

// ---- partnerships ----------------------------------------------------------

export interface Partnership {
  pair: [string, string];
  runs: number;
  balls: number;
}

/**
 * Rebuild every partnership in an innings. A partnership runs between the two
 * batters at the crease and ends when one is dismissed (or the innings ends).
 * Runs credited = runs off the bat; balls = legal balls faced by the pair.
 */
export function aggregatePartnerships(
  deliveries: DeliveryLike[],
  openingStrikerId?: Id<"players">,
  openingNonStrikerId?: Id<"players">,
): { list: Partnership[]; current: Partnership | null; highest: Partnership | null } {
  let striker = openingStrikerId;
  let nonStriker = openingNonStrikerId;
  const pairKey = (a?: Id<"players">, b?: Id<"players">) =>
    a && b ? [a, b].sort().join("|") : `${a ?? ""}|${b ?? ""}`;
  let curKey = pairKey(striker, nonStriker);
  let cur: Partnership = { pair: [striker ?? "", nonStriker ?? ""], runs: 0, balls: 0 };
  const list: Partnership[] = [];
  let prevOver = 0;

  const pushCur = () => {
    if (cur.runs > 0 || cur.balls > 0) list.push({ ...cur });
  };

  for (const d of deliveries) {
    // A new over swaps the ends — the pair itself is unchanged.
    if (d.overNumber !== prevOver && prevOver !== 0 && striker && nonStriker) {
      const t = striker;
      striker = nonStriker;
      nonStriker = t;
      cur.pair = [striker, nonStriker];
    }
    // Seed the pair from the first ball if the innings row has no openers yet.
    if (!striker) striker = d.batsmanId;
    if (!nonStriker) nonStriker = d.nonStrikerId ?? d.batsmanId;
    curKey = pairKey(striker, nonStriker);
    cur.pair = [striker, nonStriker];

    if (isLegalBall(d.extraType)) cur.balls += 1;
    cur.runs += d.runsScored;

    if (d.isWicket) {
      pushCur();
      const dismissed = d.dismissedBatterId ?? d.batsmanId;
      const survivor = striker === dismissed ? nonStriker : striker;
      striker = d.newBatsmanId ?? striker;
      nonStriker = survivor;
      cur = { pair: [striker ?? "", nonStriker ?? ""], runs: 0, balls: 0 };
      curKey = pairKey(striker, nonStriker);
    } else {
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
    }
    prevOver = d.overNumber;
  }

  const current = cur.runs > 0 || cur.balls > 0 ? cur : null;
  const all = current ? [...list, current] : list;
  const highest =
    all.length > 0
      ? all.reduce((a, b) => (b.runs > a.runs || (b.runs === a.runs && b.balls < a.balls) ? b : a))
      : null;
  return { list, current, highest };
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

// ---- DLS (Duckworth–Lewis–Stern) -------------------------------------------

// Standard T20 DLS resource table: rows are overs remaining (0..20), columns
// are wickets lost (0, 2, 5, 7, 9). Each cell = % of batting resources left.
// Published ICC Standard Edition values for 20-over cricket.
const DLS_T20_RESOURCES: number[][] = [
  [0.0, 0.0, 0.0, 0.0, 0.0], // 0 overs left
  [21.7, 18.8, 13.8, 9.2, 4.2],
  [27.3, 23.7, 17.3, 11.6, 5.3],
  [32.6, 28.2, 20.5, 13.7, 6.3],
  [37.7, 32.5, 23.6, 15.8, 7.2],
  [42.6, 36.6, 26.5, 17.7, 8.1],
  [47.3, 40.5, 29.3, 19.6, 9.0],
  [51.8, 44.3, 31.9, 21.3, 9.8],
  [56.2, 47.9, 34.4, 23.0, 10.5],
  [60.4, 51.4, 36.8, 24.6, 11.3],
  [64.5, 54.8, 39.2, 26.2, 12.0], // 10 overs left
  [68.5, 58.0, 41.4, 27.7, 12.7],
  [72.4, 61.2, 43.6, 29.2, 13.4],
  [76.2, 64.3, 45.7, 30.6, 14.0],
  [79.9, 67.3, 47.8, 31.9, 14.6],
  [83.5, 70.3, 49.8, 33.2, 15.2],
  [87.0, 73.1, 51.7, 34.5, 15.8],
  [90.4, 75.9, 53.6, 35.7, 16.4],
  [93.7, 78.6, 55.4, 36.8, 16.9],
  [96.9, 81.2, 57.2, 38.0, 17.4],
  [100.0, 83.8, 58.9, 39.1, 17.9], // 20 overs left
];
const DLS_WICKET_COLS = [0, 2, 5, 7, 9];

/**
 * Interpolated DLS resource percentage for a given overs remaining + wickets
 * lost. Used to compute a fair par score for a rain-shortened / interrupted
 * chase without needing the full ICC tables.
 */
export function dlsResourcePercent(
  oversRemaining: number,
  wicketsLost: number,
): number {
  if (oversRemaining <= 0) return 0;
  const o = Math.min(20, Math.max(0, oversRemaining));
  const w = Math.min(9, Math.max(0, wicketsLost));
  const o0 = Math.floor(o);
  const o1 = Math.min(20, o0 + 1);
  const fo = o - o0;

  // locate wicket bracket
  let w0 = 0;
  while (w0 < DLS_WICKET_COLS.length - 1 && w > DLS_WICKET_COLS[w0 + 1]) w0++;
  const w1 = Math.min(DLS_WICKET_COLS.length - 1, w0 + 1);
  const fw =
    DLS_WICKET_COLS[w1] - DLS_WICKET_COLS[w0] === 0
      ? 0
      : (w - DLS_WICKET_COLS[w0]) / (DLS_WICKET_COLS[w1] - DLS_WICKET_COLS[w0]);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const row = (r: number) => lerp(DLS_T20_RESOURCES[r][w0], DLS_T20_RESOURCES[r][w1], fw);
  const v0 = row(o0);
  const v1 = row(o1);
  return lerp(v0, v1, fo);
}

/**
 * DLS par score for the chasing side at the current state — the score they
 * must be at to be level with the first-innings total after a rain reduction.
 * `team1` is the completed first innings, `team2` the live chase. Returns null
 * when a par cannot be meaningfully computed (e.g. no chase yet).
 */
export function dlsParScore(
  team1: { totalRuns: number; ballsBowled: number; wickets: number },
  team2: { ballsBowled: number; wickets: number },
  totalOvers: number,
): number | null {
  const overs = Math.max(1, totalOvers);
  const r1Used = 100 - dlsResourcePercent(overs - team1.ballsBowled / 6, team1.wickets);
  if (r1Used <= 0) return null;
  const r2Used = 100 - dlsResourcePercent(overs - team2.ballsBowled / 6, team2.wickets);
  if (r2Used <= 0) return null;
  return Math.max(0, Math.round((team1.totalRuns * r2Used) / r1Used));
}

// ---- super over (tie-breaker) ----------------------------------------------

/** A super over innings ends after 2 wickets or 6 balls, whichever comes first. */
export function isSuperOverComplete(wickets: number, ballsBowled: number): boolean {
  return wickets >= 2 || ballsBowled >= 6;
}

/** Number of boundaries (4s + 6s) in an innings — the super-over tie-breaker. */
export function countBoundaries(
  deliveries: { runsScored: number }[],
): number {
  return deliveries.filter((d) => d.runsScored === 4 || d.runsScored === 6).length;
}

/**
 * Resolve a tied match's super over. `in3` is the super over where the team
 * that batted second in the match batted first; `in4` is the chase. The side
 * with the higher super-over total wins; on an exact tie the side with more
 * boundaries in the super over wins. Returns the winning team id or null if
 * genuinely unbreakable.
 */
export function superOverWinnerId(
  in3: { battingTeamId: string; totalRuns: number; boundaries: number },
  in4: { battingTeamId: string; totalRuns: number; boundaries: number },
): string | null {
  if (in4.totalRuns !== in3.totalRuns) {
    return in4.totalRuns > in3.totalRuns ? in4.battingTeamId : in3.battingTeamId;
  }
  if (in4.boundaries !== in3.boundaries) {
    return in4.boundaries > in3.boundaries ? in4.battingTeamId : in3.battingTeamId;
  }
  return null;
}

export function computeSuperOverResult(
  teamNames: { batting3: string; batting4: string },
  in3: { totalRuns: number; wickets: number },
  in4: { totalRuns: number; wickets: number },
): string {
  if (in4.totalRuns >= in3.totalRuns + 1) {
    const hand = Math.max(1, 2 - in4.wickets);
    return `${teamNames.batting4} won the Super Over by ${hand} wicket${
      hand === 1 ? "" : "s"
    }`;
  }
  if (in4.totalRuns === in3.totalRuns) {
    return `Super Over tied — ${teamNames.batting3} & ${teamNames.batting4} share the honours`;
  }
  const margin = in3.totalRuns - in4.totalRuns;
  return `${teamNames.batting3} won the Super Over by ${margin} run${
    margin === 1 ? "" : "s"
  }`;
}

// ---- match outcome predictor ------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Live win-probability model (ESPN-style). Chases are scored from the DLS par
 * margin; a first innings in progress is scored from the projected total vs the
 * tournament's average first-innings score. Returns probabilities for teamA /
 * teamB plus a short broadcast-style summary line.
 */
export function matchPrediction(input: {
  status: "UPCOMING" | "LIVE" | "COMPLETED";
  teamAName: string;
  teamBName: string;
  /** The team currently at the crease (batting team of the live innings). */
  battingTeamName: string | null;
  /** Resolved winner team id once the match is decided (incl. super over). */
  winnerTeamId?: string | null;
  in1?: { totalRuns: number; wickets: number; ballsBowled: number } | null;
  in2?: {
    totalRuns: number;
    wickets: number;
    ballsBowled: number;
    target: number | null;
  } | null;
  dlsPar?: number | null;
  avgFirstInnings?: number | null;
  result?: string | null;
  superOver?: boolean;
}): {
  teamA: number;
  teamB: number;
  summary: string;
  projected?: number;
} {
  const { status, teamAName, teamBName } = input;

  if (status === "COMPLETED") {
    if (input.winnerTeamId == null || input.result === "Match tied") {
      return { teamA: 50, teamB: 50, summary: input.result ?? "Match tied" };
    }
    const favA = input.winnerTeamId === "A";
    return favA
      ? { teamA: 100, teamB: 0, summary: input.result ?? `${teamAName} won` }
      : { teamA: 0, teamB: 100, summary: input.result ?? `${teamBName} won` };
  }

  if (status === "UPCOMING") {
    return {
      teamA: 50,
      teamB: 50,
      summary: "Even contest — toss & form will decide.",
    };
  }

  // ---- live ----------------------------------------------------------------
  if (input.superOver) {
    return {
      teamA: 50,
      teamB: 50,
      summary: "Super Over — one over, everything to play for!",
    };
  }

  const in1 = input.in1;
  const in2 = input.in2;
  const battingName = input.battingTeamName;

  // Chase (in progress or about to start) → DLS par margin drives the model.
  if (in2 && in2.target != null && battingName) {
    if (input.dlsPar == null) {
      const pct = 50;
      const summary =
        in2.ballsBowled === 0
          ? `${battingName} begin the chase — target ${in2.target}`
          : `${battingName} need ${Math.max(0, in2.target - in2.totalRuns)} · ${pct}% to win`;
      return battingName === teamAName
        ? { teamA: pct, teamB: 100 - pct, summary }
        : { teamA: 100 - pct, teamB: pct, summary };
    }
    const margin = in2.totalRuns - input.dlsPar;
    const pChase = clamp(sigmoid(0.07 * margin), 0.05, 0.95);
    const ballsLeft = Math.max(0, 120 - in2.ballsBowled);
    const need = Math.max(0, in2.target - in2.totalRuns);
    const summary =
      need === 0
        ? `${battingName} are there — win probability locked`
        : `${battingName} need ${need} off ${ballsLeft} · ${Math.round(pChase * 100)}% to chase`;
    const pct = Math.round(pChase * 100);
    return battingName === teamAName
      ? { teamA: pct, teamB: 100 - pct, summary }
      : { teamA: 100 - pct, teamB: pct, summary };
  }

  // First innings in progress → projected total vs league average.
  if (in1 && battingName) {
    const ballsLeft = Math.max(0, 120 - in1.ballsBowled);
    const crr = in1.ballsBowled > 0 ? (in1.totalRuns / in1.ballsBowled) * 6 : 0;
    const projected = Math.round(in1.totalRuns + (crr * ballsLeft) / 6);
    const avg = input.avgFirstInnings;
    const p = avg ? clamp(sigmoid(0.025 * (projected - avg)), 0.05, 0.95) : 0.5;
    const pct = Math.round(p * 100);
    const summary = avg
      ? `${battingName} projected ${projected} (avg ${Math.round(avg)}) · ${pct}% to win`
      : `${battingName} projected ${projected}`;
    return battingName === teamAName
      ? { teamA: pct, teamB: 100 - pct, summary, projected }
      : { teamA: 100 - pct, teamB: pct, summary, projected };
  }

  return { teamA: 50, teamB: 50, summary: "Waiting for the first ball…" };
}
