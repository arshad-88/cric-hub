// ---------------------------------------------------------------------------
// mvp.ts — Player of the Match + Tournament MVP rankings.
//
// Everything is computed on read from the actual deliveries of completed
// matches (no stored snapshots), so correcting/undoing a ball automatically
// recalculates every MVP line. The scoring formula lives in cricket.ts
// (computeMvpScore / DEFAULT_MVP_CONFIG) and can be tuned per league via the
// `mvpConfig` settings key — a JSON object of partial weights.
// ---------------------------------------------------------------------------

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  aggregateBatterStats,
  aggregateBowlerStats,
  computeMvpScore,
  DEFAULT_MVP_CONFIG,
  matchWinnerTeamId,
  superOverWinnerId,
  type MvpConfig,
} from "./cricket";
import { WICKET_TYPE } from "./schema";
import { getActiveTournament } from "./helpers";

type DeliveryRow = {
  matchId: Id<"matches">;
  inningsId: Id<"innings">;
  batsmanId: Id<"players">;
  bowlerId: Id<"players">;
  runsScored: number;
  totalRuns: number;
  isWicket: boolean;
  wicketType?: string;
  fielderId?: Id<"players">;
  dismissedBatterId?: Id<"players">;
  extraType: string;
};

async function loadConfig(ctx: Parameters<typeof getActiveTournament>[0]): Promise<MvpConfig> {
  try {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "mvpConfig"))
      .first();
    if (row) return { ...DEFAULT_MVP_CONFIG, ...JSON.parse(row.value) };
  } catch {
    // fall through to defaults
  }
  return DEFAULT_MVP_CONFIG;
}

/** Fielding line (catches / run-outs / stumpings) credited to each fielder. */
function fieldingAgg(deliveries: DeliveryRow[]) {
  const map = new Map<string, { catches: number; runOuts: number; stumpings: number }>();
  const ensure = (pid: string) => {
    let e = map.get(pid);
    if (!e) {
      e = { catches: 0, runOuts: 0, stumpings: 0 };
      map.set(pid, e);
    }
    return e;
  };
  for (const d of deliveries) {
    if (!d.isWicket || !d.fielderId) continue;
    const e = ensure(String(d.fielderId));
    if (d.wicketType === WICKET_TYPE.CAUGHT) e.catches += 1;
    else if (d.wicketType === WICKET_TYPE.STUMPED) e.stumpings += 1;
    else if (d.wicketType === WICKET_TYPE.RUN_OUT) e.runOuts += 1;
  }
  return map;
}

async function matchWinner(
  ctx: Parameters<typeof getActiveTournament>[0],
  match: { _id: Id<"matches">; superOver?: boolean },
): Promise<string | null> {
  const innings = await ctx.db
    .query("innings")
    .withIndex("by_match", (q) => q.eq("matchId", match._id))
    .collect();
  const in1 = innings.find((i) => i.number === 1);
  const in2 = innings.find((i) => i.number === 2);
  if (!in1 || !in2) return null;
  if (match.superOver) {
    const in3 = innings.find((i) => i.number === 3);
    const in4 = innings.find((i) => i.number === 4);
    if (!in3 || !in4) return null;
    const boundariesOf = async (inn: { _id: Id<"innings"> }) => {
      const ds = await ctx.db
        .query("deliveries")
        .withIndex("by_innings", (q) => q.eq("inningsId", inn._id))
        .collect();
      return ds.filter((d) => d.runsScored === 4 || d.runsScored === 6).length;
    };
    return superOverWinnerId(
      {
        battingTeamId: in3.battingTeamId,
        totalRuns: in3.totalRuns,
        boundaries: await boundariesOf(in3),
      },
      {
        battingTeamId: in4.battingTeamId,
        totalRuns: in4.totalRuns,
        boundaries: await boundariesOf(in4),
      },
    );
  }
  return matchWinnerTeamId(
    {
      battingTeamId: in1.battingTeamId,
      totalRuns: in1.totalRuns,
      wickets: in1.wickets,
      ballsBowled: in1.ballsBowled,
      target: in1.target ?? undefined,
    },
    {
      battingTeamId: in2.battingTeamId,
      totalRuns: in2.totalRuns,
      wickets: in2.wickets,
      ballsBowled: in2.ballsBowled,
      target: in2.target ?? undefined,
    },
  );
}

export interface MvpLine {
  playerId: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  teamShortCode: string | null;
  teamColor: string | null;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  sr: number;
  wickets: number;
  runsConceded: number;
  ballsBowled: number;
  maidens: number;
  econ: number;
  catches: number;
  runOuts: number;
  stumpings: number;
  score: number;
}

function buildLine(
  player: { _id: Id<"players">; name: string; teamId: Id<"teams"> },
  team: { name: string; shortCode: string; color: string } | null,
  batting: ReturnType<typeof aggregateBatterStats> | undefined,
  bowling: ReturnType<typeof aggregateBowlerStats> | undefined,
  fielding: ReturnType<typeof fieldingAgg> | undefined,
  teamWon: boolean,
  config: MvpConfig,
): MvpLine | null {
  const b = batting?.get(player._id);
  const w = bowling?.get(player._id);
  const f = fielding?.get(String(player._id));
  if (!b && !w && !f) return null;
  const runs = b?.runs ?? 0;
  const balls = b?.balls ?? 0;
  const fours = b?.fours ?? 0;
  const sixes = b?.sixes ?? 0;
  const wickets = w?.wickets ?? 0;
  const runsConceded = w?.runs ?? 0;
  const ballsBowled = w?.balls ?? 0;
  const maidens = w?.maidens ?? 0;
  const catches = f?.catches ?? 0;
  const runOuts = f?.runOuts ?? 0;
  const stumpings = f?.stumpings ?? 0;
  const score = computeMvpScore(
    {
      runs,
      balls,
      fours,
      sixes,
      wickets,
      runsConceded,
      ballsBowled,
      maidens,
      catches,
      runOuts,
      stumpings,
      teamWon,
    },
    config,
  );
  return {
    playerId: String(player._id),
    name: player.name,
    teamId: team ? String(player.teamId) : null,
    teamName: team?.name ?? null,
    teamShortCode: team?.shortCode ?? null,
    teamColor: team?.color ?? null,
    runs,
    balls,
    fours,
    sixes,
    sr: balls > 0 ? Number(((runs / balls) * 100).toFixed(1)) : 0,
    wickets,
    runsConceded,
    ballsBowled,
    maidens,
    econ: ballsBowled > 0 ? Number((runsConceded / (ballsBowled / 6)).toFixed(2)) : 0,
    catches,
    runOuts,
    stumpings,
    score,
  };
}

/** Player of the Match for one completed match (top 3 by MVP score). */
export const getMatch = query({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    if (!match || match.status !== "COMPLETED") return null;
    const config = await loadConfig(ctx);
    const innings = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const winner = await matchWinner(ctx, match);
    const teamMap = new Map<Id<"teams">, { name: string; shortCode: string; color: string }>();
    for (const inn of innings) {
      const bt = await ctx.db.get(inn.battingTeamId);
      const bw = await ctx.db.get(inn.bowlingTeamId);
      if (bt) teamMap.set(bt._id, { name: bt.name, shortCode: bt.shortCode, color: bt.color });
      if (bw) teamMap.set(bw._id, { name: bw.name, shortCode: bw.shortCode, color: bw.color });
    }
    const playerIds = new Set<Id<"players">>();
    for (const d of deliveries) {
      playerIds.add(d.batsmanId);
      playerIds.add(d.bowlerId);
      if (d.fielderId) playerIds.add(d.fielderId);
    }
    const players = (
      await Promise.all([...playerIds].map((id) => ctx.db.get(id)))
    ).filter((p) => p !== null);

    const batting = aggregateBatterStats(deliveries);
    const bowling = aggregateBowlerStats(deliveries);
    const fielding = fieldingAgg(deliveries);

    const lines = players
      .map((p) =>
        buildLine(p, teamMap.get(p!.teamId) ?? null, batting, bowling, fielding, winner === p!.teamId, config),
      )
      .filter((l): l is MvpLine => l !== null)
      .sort((a, b) => b.score - a.score);

    return {
      matchId,
      config,
      top: lines.slice(0, 3),
      winnerTeamId: winner ? String(winner) : null,
    };
  },
});

/** Tournament MVP ranking — every player's MVP points summed across matches. */
export const getTournament = query({
  args: { tournamentId: v.optional(v.id("tournaments")) },
  handler: async (ctx, { tournamentId }) => {
    const tournament = tournamentId
      ? await ctx.db.get(tournamentId)
      : await getActiveTournament(ctx);
    if (!tournament) return null;
    const config = await loadConfig(ctx);
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_tournament_status", (q) =>
        q.eq("tournamentId", tournament._id),
      )
      .collect();
    const completed = matches.filter((m) => m.status === "COMPLETED");

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();
    const teamMap = new Map(teams.map((t) => [t._id, t]));

    const totals = new Map<
      string,
      MvpLine & { matches: number }
    >();

    for (const m of completed) {
      const innings = await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .collect();
      const deliveries = await ctx.db
        .query("deliveries")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .collect();
      const winner = await matchWinner(ctx, m);
      const playerIds = new Set<Id<"players">>();
      for (const d of deliveries) {
        playerIds.add(d.batsmanId);
        playerIds.add(d.bowlerId);
        if (d.fielderId) playerIds.add(d.fielderId);
      }
      const players = (
        await Promise.all([...playerIds].map((id) => ctx.db.get(id)))
      ).filter((p) => p !== null);
      const batting = aggregateBatterStats(deliveries);
      const bowling = aggregateBowlerStats(deliveries);
      const fielding = fieldingAgg(deliveries);

      for (const p of players) {
        const line = buildLine(
          p,
          teamMap.get(p!.teamId) ?? null,
          batting,
          bowling,
          fielding,
          winner === p!.teamId,
          config,
        );
        if (!line) continue;
        const key = String(p!._id);
        const cur = totals.get(key);
        if (!cur) {
          totals.set(key, { ...line, matches: 1 });
        } else {
          cur.matches += 1;
          cur.runs += line.runs;
          cur.balls += line.balls;
          cur.fours += line.fours;
          cur.sixes += line.sixes;
          cur.wickets += line.wickets;
          cur.runsConceded += line.runsConceded;
          cur.ballsBowled += line.ballsBowled;
          cur.maidens += line.maidens;
          cur.catches += line.catches;
          cur.runOuts += line.runOuts;
          cur.stumpings += line.stumpings;
          cur.score = Math.round((cur.score + line.score) * 10) / 10;
          cur.sr = cur.balls > 0 ? Number(((cur.runs / cur.balls) * 100).toFixed(1)) : 0;
          cur.econ =
            cur.ballsBowled > 0
              ? Number((cur.runsConceded / (cur.ballsBowled / 6)).toFixed(2))
              : 0;
        }
      }
    }

    const rows = [...totals.values()].sort(
      (a, b) => b.score - a.score || b.wickets - a.wickets || b.runs - a.runs,
    );
    return {
      tournament: { id: tournament._id, name: tournament.name, year: tournament.year },
      config,
      rows,
    };
  },
});
