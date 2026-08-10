// ---------------------------------------------------------------------------
// career.ts — career stats across ALL tournaments, keyed by phone number.
//
// A player can appear in many tournament rosters (one `players` doc per team).
// Because every roster entry stores the same canonical phone number, we can
// aggregate deliveries across all of those docs to build a true career line:
// runs, balls, fours/sixes, wickets, matches, innings — and a "recent form"
// slice (last N completed matches) used by the auction's best-squad logic.
// ---------------------------------------------------------------------------

import type { Id } from "./_generated/dataModel";
import { bowlerCredited, isLegalBall } from "./cricket";
import type { Ctx } from "./helpers";

export interface CareerLine {
  matches: number;
  innings: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  wickets: number;
  ballsBowled: number;
  runsConceded: number;
}

/** Empty line used before any data exists. */
export const emptyCareer = (): CareerLine => ({
  matches: 0,
  innings: 0,
  runs: 0,
  balls: 0,
  fours: 0,
  sixes: 0,
  wickets: 0,
  ballsBowled: 0,
  runsConceded: 0,
});

function aggregateRows(
  rows: {
    matchId: Id<"matches">;
    inningsId: Id<"innings">;
    batsmanId: Id<"players">;
    bowlerId: Id<"players">;
    runsScored: number;
    extraType: string;
    totalRuns: number;
    isWicket: boolean;
  }[],
  ids: Set<string>,
): CareerLine {
  const out = emptyCareer();
  const matches = new Set<string>();
  const innings = new Set<string>();
  for (const d of rows) {
    matches.add(d.matchId);
    innings.add(d.inningsId);
    if (ids.has(d.batsmanId)) {
      if (isLegalBall(d.extraType as never)) out.balls += 1;
      out.runs += d.runsScored;
      if (d.runsScored === 4) out.fours += 1;
      if (d.runsScored === 6) out.sixes += 1;
    }
    if (ids.has(d.bowlerId)) {
      if (isLegalBall(d.extraType as never)) out.ballsBowled += 1;
      out.runsConceded += d.totalRuns;
      if (bowlerCredited(d as never)) out.wickets += 1;
    }
  }
  out.matches = matches.size;
  out.innings = innings.size;
  return out;
}

/** Full career line across every tournament the player docs appear in. */
export async function careerForPlayerDocs(
  ctx: Ctx,
  playerDocs: { _id: Id<"players"> }[],
): Promise<CareerLine> {
  if (playerDocs.length === 0) return emptyCareer();
  const ids = new Set(playerDocs.map((p) => String(p._id)));
  const deliveries = await ctx.db.query("deliveries").collect();
  const mine = deliveries.filter(
    (d) => ids.has(d.batsmanId) || ids.has(d.bowlerId),
  );
  return aggregateRows(mine as never, ids);
}

/** Recent-form line: the last `recentMatches` matches with data, newest first. */
export async function formForPlayerDocs(
  ctx: Ctx,
  playerDocs: { _id: Id<"players"> }[],
  recentMatches = 3,
): Promise<CareerLine> {
  if (playerDocs.length === 0) return emptyCareer();
  const ids = new Set(playerDocs.map((p) => String(p._id)));
  const deliveries = await ctx.db.query("deliveries").collect();
  deliveries.sort((a, b) => b._creationTime - a._creationTime);
  const seenMatches = new Set<string>();
  const rows: (typeof deliveries)[number][] = [];
  for (const d of deliveries) {
    if (!ids.has(d.batsmanId) && !ids.has(d.bowlerId)) continue;
    if (!seenMatches.has(d.matchId)) {
      if (seenMatches.size >= recentMatches) break;
      seenMatches.add(d.matchId);
    }
    rows.push(d);
  }
  return aggregateRows(rows as never, ids);
}

/**
 * All player docs across all tournaments that carry this canonical phone
 * number (used by phone-based identity lookups).
 */
export async function playerDocsByPhone(
  ctx: Ctx,
  phone: string,
): Promise<{ _id: Id<"players">; teamId: Id<"teams">; name: string }[]> {
  const players = await ctx.db.query("players").collect();
  return players
    .filter((p) => p.phone === phone)
    .map((p) => ({ _id: p._id, teamId: p.teamId, name: p.name }));
}

/** Distinct tournament ids a phone-linked player has appeared in. */
export async function tournamentIdsForPlayerDocs(
  ctx: Ctx,
  playerDocs: { teamId: Id<"teams"> }[],
): Promise<string[]> {
  const teamIds = new Set(playerDocs.map((p) => String(p.teamId)));
  const teams = await ctx.db.query("teams").collect();
  const ids = new Set<string>();
  for (const t of teams) {
    if (teamIds.has(String(t._id))) ids.add(String(t.tournamentId));
  }
  return [...ids];
}

/** Shared: map playerIds → aggregate per-phone group across all tournaments. */
export async function careerPerPlayerId(
  ctx: Ctx,
): Promise<Map<string, CareerLine>> {
  const deliveries = await ctx.db.query("deliveries").collect();
  const map = new Map<string, CareerLine>();
  const matches = new Map<string, Set<string>>();
  const innings = new Map<string, Set<string>>();
  for (const d of deliveries) {
    for (const pid of [d.batsmanId, d.bowlerId]) {
      let line = map.get(pid);
      if (!line) {
        line = emptyCareer();
        map.set(pid, line);
        matches.set(pid, new Set());
        innings.set(pid, new Set());
      }
      matches.get(pid)!.add(d.matchId);
      innings.get(pid)!.add(d.inningsId);
    }
    const bLine = map.get(d.batsmanId);
    if (bLine) {
      if (isLegalBall(d.extraType)) bLine.balls += 1;
      bLine.runs += d.runsScored;
      if (d.runsScored === 4) bLine.fours += 1;
      if (d.runsScored === 6) bLine.sixes += 1;
    }
    const wLine = map.get(d.bowlerId);
    if (wLine) {
      if (isLegalBall(d.extraType)) wLine.ballsBowled += 1;
      wLine.runsConceded += d.totalRuns;
      if (bowlerCredited(d)) wLine.wickets += 1;
    }
  }
  for (const [pid, line] of map) {
    line.matches = matches.get(pid)?.size ?? 0;
    line.innings = innings.get(pid)?.size ?? 0;
  }
  return map;
}
