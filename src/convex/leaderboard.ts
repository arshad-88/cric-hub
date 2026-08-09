// ---------------------------------------------------------------------------
// leaderboard.ts — Points table (P/W/L/T/Pts/NRR) + Orange Cap (runs) and
// Purple Cap (wickets) boards, derived reactively from completed matches.
// ---------------------------------------------------------------------------

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  aggregateBatterStats,
  aggregateBowlerStats,
  formatOvers,
  matchWinnerTeamId,
  runRate,
  teamNRR,
} from "./cricket";
import { getActiveTournament } from "./helpers";

const lite = (t: { _id: Id<"teams">; name: string; shortCode: string; color: string }) => ({
  _id: t._id,
  name: t.name,
  shortCode: t.shortCode,
  color: t.color,
});

export const get = query({
  args: { tournamentId: v.optional(v.id("tournaments")) },
  handler: async (ctx, { tournamentId }) => {
    const tournament = tournamentId
      ? await ctx.db.get(tournamentId)
      : await getActiveTournament(ctx);
    if (!tournament) return null;

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_tournament_status", (q) =>
        q.eq("tournamentId", tournament._id),
      )
      .collect();
    const completed = matches.filter((m) => m.status === "COMPLETED");

    // ---- points table -----------------------------------------------------
    const stat = () => ({
      played: 0,
      won: 0,
      lost: 0,
      tied: 0,
      points: 0,
      runsFor: 0,
      ballsFor: 0,
      runsAgainst: 0,
      ballsAgainst: 0,
    });
    const stats = new Map<Id<"teams">, ReturnType<typeof stat>>();
    for (const team of teams) stats.set(team._id, stat());

    for (const m of completed) {
      const innings = await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .collect();
      const in1 = innings.find((i) => i.number === 1);
      const in2 = innings.find((i) => i.number === 2);
      if (!in1) continue;

      const winnerId = matchWinnerTeamId(
        {
          battingTeamId: in1.battingTeamId,
          totalRuns: in1.totalRuns,
          wickets: in1.wickets,
          ballsBowled: in1.ballsBowled,
          target: in1.target ?? undefined,
        },
        in2
          ? {
              battingTeamId: in2.battingTeamId,
              totalRuns: in2.totalRuns,
              wickets: in2.wickets,
              ballsBowled: in2.ballsBowled,
              target: in2.target ?? undefined,
            }
          : null,
      );

      for (const battingTeamId of [in1.battingTeamId, in2?.battingTeamId]) {
        if (!battingTeamId) continue;
        const s = stats.get(battingTeamId);
        if (!s) continue;
        s.played += 1;
        if (winnerId === null) {
          s.tied += 1;
          s.points += 1;
        } else if (winnerId === battingTeamId) {
          s.won += 1;
          s.points += 2;
        } else {
          s.lost += 1;
        }
      }

      // NRR accumulation (an all-out innings counts as the full allocation)
      for (const inn of innings) {
        const oversFaced = inn.wickets >= 10 ? m.overs * 6 : inn.ballsBowled;
        const bat = stats.get(inn.battingTeamId);
        const bowl = stats.get(inn.bowlingTeamId);
        if (bat) {
          bat.runsFor += inn.totalRuns;
          bat.ballsFor += oversFaced;
        }
        if (bowl) {
          bowl.runsAgainst += inn.totalRuns;
          bowl.ballsAgainst += oversFaced;
        }
      }
    }

    const pointsTable = teams
      .map((team) => {
        const s = stats.get(team._id)!;
        return {
          team: lite(team),
          played: s.played,
          won: s.won,
          lost: s.lost,
          tied: s.tied,
          points: s.points,
          nrr: teamNRR(s.runsFor, s.ballsFor, s.runsAgainst, s.ballsAgainst),
        };
      })
      .sort((a, b) => b.points - a.points || b.nrr - a.nrr);

    // ---- orange / purple caps across completed matches --------------------
    const allDeliveries = [];
    for (const m of completed) {
      const ds = await ctx.db
        .query("deliveries")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .collect();
      allDeliveries.push(...ds);
    }

    const batterAgg = aggregateBatterStats(allDeliveries);
    const bowlerAgg = aggregateBowlerStats(allDeliveries);

    const playerIds = new Set<Id<"players">>([
      ...batterAgg.keys(),
      ...bowlerAgg.keys(),
    ]);
    const players = (
      await Promise.all([...playerIds].map((id) => ctx.db.get(id)))
    ).filter((p) => p !== null);
    const playerMap = new Map(players.map((p) => [p!._id, p!]));
    const teamMap = new Map(teams.map((t) => [t._id, t]));

    const inningsCount = new Map<string, Set<string>>();
    for (const d of allDeliveries) {
      let set = inningsCount.get(d.batsmanId);
      if (!set) {
        set = new Set();
        inningsCount.set(d.batsmanId, set);
      }
      set.add(d.matchId);
    }

    const topBatters = [...batterAgg.values()]
      .map((b) => {
        const p = playerMap.get(b.playerId);
        const team = p ? teamMap.get(p.teamId) : null;
        return {
          playerId: b.playerId,
          name: p?.name ?? "Unknown",
          team: team ? lite(team) : null,
          runs: b.runs,
          balls: b.balls,
          fours: b.fours,
          sixes: b.sixes,
          sr: b.balls > 0 ? Number(((b.runs / b.balls) * 100).toFixed(1)) : 0,
          innings: inningsCount.get(b.playerId)?.size ?? 0,
        };
      })
      .filter((b) => b.innings > 0)
      .sort(
        (a, b) => b.runs - a.runs || b.sr - a.sr || a.balls - b.balls || a.name.localeCompare(b.name),
      )
      .slice(0, 10);

    const topBowlers = [...bowlerAgg.values()]
      .filter((b) => b.balls > 0)
      .map((b) => {
        const p = playerMap.get(b.playerId);
        const team = p ? teamMap.get(p.teamId) : null;
        return {
          playerId: b.playerId,
          name: p?.name ?? "Unknown",
          team: team ? lite(team) : null,
          wickets: b.wickets,
          runs: b.runs,
          balls: b.balls,
          overs: formatOvers(b.balls),
          maidens: b.maidens,
          econ: runRate(b.runs, b.balls),
        };
      })
      .sort(
        (a, b) =>
          b.wickets - a.wickets ||
          a.econ - b.econ ||
          a.runs - b.runs ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 10);

    return {
      tournament: {
        id: tournament._id,
        name: tournament.name,
        year: tournament.year,
      },
      pointsTable,
      topBatters,
      topBowlers,
    };
  },
});
