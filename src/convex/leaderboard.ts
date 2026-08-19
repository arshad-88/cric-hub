// ---------------------------------------------------------------------------
// leaderboard.ts — Points table (P/W/L/T/Pts/NRR) + Orange Cap (runs) and
// Purple Cap (wickets) boards, derived reactively from completed matches.
// ---------------------------------------------------------------------------

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { careerPerPlayerId } from "./career";
import {
  aggregateBatterStats,
  aggregateBowlerStats,
  countBoundaries,
  formatOvers,
  matchWinnerTeamId,
  runRate,
  superOverWinnerId,
  teamNRR,
} from "./cricket";
import { WICKET_TYPE } from "./schema";
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
      // ---- conceded / withdrawn matches ---------------------------------
      // No innings may exist, but the result string names the winner.
      const isConceded = m.result?.startsWith("[CONCEDED]") ?? false;
      if (isConceded) {
        const winnerNameInResult = m.result?.match(/^\[CONCEDED\] (.+?) won by/)?.[1];
        const winnerTeam = teams.find((t) => t.name === winnerNameInResult);
        for (const teamId of [m.teamAId, m.teamBId]) {
          const s = stats.get(teamId);
          if (!s) continue;
          s.played += 1;
          if (winnerTeam && teamId === winnerTeam._id) {
            s.won += 1;
            s.points += 2;
          } else {
            s.lost += 1;
          }
        }
        continue; // no NRR for conceded matches
      }

      // ---- fetch innings ------------------------------------------------
      const innings = await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .collect();
      const in1 = innings.find((i) => i.number === 1);
      const in2 = innings.find((i) => i.number === 2);

      // ---- BOTH match participants ALWAYS get +1 Played ------------------
      // This runs unconditionally so no team is silently skipped.
      const sA = stats.get(m.teamAId);
      const sB = stats.get(m.teamBId);
      if (sA) sA.played += 1;
      if (sB) sB.played += 1;

      // If only innings 1 exists and the match is completed (e.g.
      // endInningsEarly on inn1), it's a no-result: both get +1P +1Pt
      // but no W/L/T and no NRR.
      if (!in1 || !in2) {
        if (sA) sA.points += 1;
        if (sB) sB.points += 1;
        continue;
      }

      // ---- determine winner ---------------------------------------------
      let winnerId: string | null = null;

      if (m.superOver) {
        const in3 = innings.find((i) => i.number === 3);
        const in4 = innings.find((i) => i.number === 4);
        if (in3 && in4) {
          // Super over completed — determine winner from SO data.
          const boundariesOf = async (inn: (typeof in3) | null) => {
            if (!inn) return 0;
            const ds = await ctx.db
              .query("deliveries")
              .withIndex("by_innings", (q) => q.eq("inningsId", inn._id))
              .collect();
            return countBoundaries(ds);
          };
          winnerId = superOverWinnerId(
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
        } else {
          // Super over flag is stale (e.g. after undo cleared the SO innings).
          // Fall back to regular match winner detection from inn1/inn2.
          winnerId = matchWinnerTeamId(
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
      } else {
        winnerId = matchWinnerTeamId(
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

      // ---- result-string fallback for winner detection -------------------
      // If innings data gives null but the stored result names a winner,
      // parse it to avoid stale/inconsistent data producing a false tie.
      if (winnerId === null && m.result) {
        const resultLower = m.result.toLowerCase();
        if (resultLower.includes("won by")) {
          // Extract the team name before "won by" — could be "Team A won by"
          // or "Team A won the Super Over by" etc.
          const winnerNameMatch = m.result.match(/^(.+?)\s+won\b/);
          if (winnerNameMatch) {
            const winnerName = winnerNameMatch[1].trim();
            const fallbackTeam = teams.find(
              (t) => t.name === winnerName || m.result?.startsWith(winnerName),
            );
            if (fallbackTeam) winnerId = fallbackTeam._id;
          }
        }
      }

      // ---- apply W / L / T / Pts to BOTH match participants ---------------
      // Always iterate over m.teamAId and m.teamBId (not innings batting
      // teams) so both teams are guaranteed to be updated.
      for (const teamId of [m.teamAId, m.teamBId]) {
        const s = stats.get(teamId);
        if (!s) continue;
        if (winnerId === null) {
          // Genuine tie (both innings exist, scores equal)
          s.tied += 1;
          s.points += 1;
        } else if (winnerId === teamId) {
          s.won += 1;
          s.points += 2;
        } else {
          s.lost += 1;
        }
      }

      // ---- NRR accumulation ---------------------------------------------
      // ICC rule: all-out counts as full overs allocation.
      // Chase completed early: use actual balls faced (not full allocation).
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

    // Load manual points overrides (organizer can edit the table)
    const overrides = await ctx.db
      .query("pointsOverrides")
      .withIndex("by_tournament_team", (q) =>
        q.eq("tournamentId", tournament._id),
      )
      .collect();
    const overrideMap = new Map(overrides.map((o) => [String(o.teamId), o]));

    const pointsTable = teams
      .map((team) => {
        const s = stats.get(team._id)!;
        const ov = overrideMap.get(String(team._id));
        return {
          team: lite(team),
          played: ov?.played ?? s.played,
          won: ov?.won ?? s.won,
          lost: ov?.lost ?? s.lost,
          tied: ov?.tied ?? s.tied,
          points: ov?.points ?? s.points,
          nrr: ov?.nrr ?? teamNRR(s.runsFor, s.ballsFor, s.runsAgainst, s.ballsAgainst),
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

    // ---- fielding (catches / run-outs / stumpings) --------------------------
    const catchesAgg = new Map<string, number>();
    const runOutsAgg = new Map<string, number>();
    const stumpingsAgg = new Map<string, number>();
    for (const d of allDeliveries) {
      if (!d.isWicket || !d.fielderId) continue;
      const pid = String(d.fielderId);
      if (d.wicketType === WICKET_TYPE.CAUGHT)
        catchesAgg.set(pid, (catchesAgg.get(pid) ?? 0) + 1);
      else if (d.wicketType === WICKET_TYPE.RUN_OUT)
        runOutsAgg.set(pid, (runOutsAgg.get(pid) ?? 0) + 1);
      else if (d.wicketType === WICKET_TYPE.STUMPED)
        stumpingsAgg.set(pid, (stumpingsAgg.get(pid) ?? 0) + 1);
    }

    const row = (pid: string) => {
      const p = playerMap.get(pid as Id<"players">);
      const team = p ? teamMap.get(p.teamId) : null;
      return {
        playerId: pid,
        name: p?.name ?? "Unknown",
        team: team ? lite(team) : null,
      };
    };

    const mostSixes = [...batterAgg.values()]
      .filter((b) => b.sixes > 0)
      .map((b) => ({ ...row(String(b.playerId)), sixes: b.sixes, runs: b.runs, sr: b.balls > 0 ? Number(((b.runs / b.balls) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.sixes - a.sixes || b.runs - a.runs)
      .slice(0, 10);

    const mostFours = [...batterAgg.values()]
      .filter((b) => b.fours > 0)
      .map((b) => ({ ...row(String(b.playerId)), fours: b.fours, runs: b.runs }))
      .sort((a, b) => b.fours - a.fours || b.runs - a.runs)
      .slice(0, 10);

    const bestEconomy = [...bowlerAgg.values()]
      .filter((b) => b.balls >= 12) // min 2 overs to qualify
      .map((b) => ({
        ...row(String(b.playerId)),
        econ: runRate(b.runs, b.balls),
        overs: formatOvers(b.balls),
        wickets: b.wickets,
        runs: b.runs,
      }))
      .sort((a, b) => a.econ - b.econ || b.wickets - a.wickets)
      .slice(0, 10);

    const bestAverage = [...batterAgg.values()]
      .filter((b) => b.balls >= 20)
      .map((b) => {
        const dismissed = b.dismissal ? 1 : 0;
        return {
          ...row(String(b.playerId)),
          runs: b.runs,
          dismissals: dismissed,
          avg: dismissed > 0 ? Number((b.runs / dismissed).toFixed(2)) : b.runs,
          sr: b.balls > 0 ? Number(((b.runs / b.balls) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.avg - a.avg || b.runs - a.runs)
      .slice(0, 10);

    const mostCatches = [...catchesAgg.entries()]
      .map(([pid, catches]) => ({ ...row(pid), catches, runOuts: runOutsAgg.get(pid) ?? 0, stumpings: stumpingsAgg.get(pid) ?? 0 }))
      .sort((a, b) => b.catches - a.catches || b.runOuts - a.runOuts)
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
      mostSixes,
      mostFours,
      bestEconomy,
      bestAverage,
      mostCatches,
    };
  },
});

// ---------------------------------------------------------------------------
// career — cross-tournament leaderboard. A phone number identifies one human;
// every roster doc carrying that number is merged into a single career line,
// so stats keep growing as the same player appears in more tournaments.
// ---------------------------------------------------------------------------

export const career = query({
  args: {},
  handler: async (ctx) => {
    const players = await ctx.db.query("players").collect();
    const users = await ctx.db.query("users").collect();
    const userByPhone = new Map(
      users.filter((u) => u.phone).map((u) => [u.phone!, u]),
    );
    const teams = await ctx.db.query("teams").collect();
    const teamById = new Map(teams.map((t) => [t._id, t]));

    // group player docs by identity key (phone when available, else doc id)
    const groups = new Map<
      string,
      {
        name: string;
        phone?: string;
        playerIds: Set<string>;
        teamIds: Set<string>;
        tournaments: Set<string>;
      }
    >();
    for (const p of players) {
      const key = p.phone ?? `p:${p._id}`;
      let g = groups.get(key);
      if (!g) {
        const user = p.phone ? userByPhone.get(p.phone) : null;
        g = {
          name: user?.name ?? p.name,
          phone: p.phone,
          playerIds: new Set(),
          teamIds: new Set(),
          tournaments: new Set(),
        };
        groups.set(key, g);
      }
      g.playerIds.add(String(p._id));
      g.teamIds.add(String(p.teamId));
      const team = teamById.get(p.teamId);
      if (team) g.tournaments.add(String(team.tournamentId));
    }

    const perPlayer = await careerPerPlayerId(ctx);

    const batters = [];
    const bowlers = [];
    for (const g of groups.values()) {
      const line = { matches: 0, innings: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, ballsBowled: 0, runsConceded: 0 };
      for (const pid of g.playerIds) {
        const l = perPlayer.get(pid);
        if (!l) continue;
        line.matches = Math.max(line.matches, l.matches);
        line.innings += l.innings;
        line.runs += l.runs;
        line.balls += l.balls;
        line.fours += l.fours;
        line.sixes += l.sixes;
        line.wickets += l.wickets;
        line.ballsBowled += l.ballsBowled;
        line.runsConceded += l.runsConceded;
      }
      if (line.balls > 0 || line.runs > 0) {
        batters.push({
          key: g.phone ?? "",
          name: g.name,
          leagues: g.tournaments.size,
          runs: line.runs,
          balls: line.balls,
          fours: line.fours,
          sixes: line.sixes,
          sr: line.balls > 0 ? Number(((line.runs / line.balls) * 100).toFixed(1)) : 0,
          innings: line.innings,
          matches: line.matches,
        });
      }
      if (line.ballsBowled > 0 || line.wickets > 0) {
        bowlers.push({
          key: g.phone ?? "",
          name: g.name,
          leagues: g.tournaments.size,
          wickets: line.wickets,
          runs: line.runsConceded,
          balls: line.ballsBowled,
          overs: formatOvers(line.ballsBowled),
          maidens: 0,
          econ: runRate(line.runsConceded, line.ballsBowled),
          matches: line.matches,
        });
      }
    }

    batters.sort(
      (a, b) => b.runs - a.runs || b.sr - a.sr || a.balls - b.balls || a.name.localeCompare(b.name),
    );
    bowlers.sort(
      (a, b) => b.wickets - a.wickets || a.econ - b.econ || a.runs - b.runs || a.name.localeCompare(b.name),
    );

    return {
      topBatters: batters.slice(0, 10),
      topBowlers: bowlers.slice(0, 10),
    };
  },
});

import { mutation } from "./_generated/server";
import { requireOrganizer } from "./helpers";

/**
 * Save a manual points override for a team. The organizer can edit points,
 * wins, losses, ties, played, and NRR. Pass null for any field to clear
 * the override (revert to computed value).
 */
export const savePointsOverride = mutation({
  args: {
    tournamentId: v.id("tournaments"),
    teamId: v.id("teams"),
    played: v.optional(v.number()),
    won: v.optional(v.number()),
    lost: v.optional(v.number()),
    tied: v.optional(v.number()),
    points: v.optional(v.number()),
    nrr: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx, args.tournamentId);
    const team = await ctx.db.get(args.teamId);
    if (!team || team.tournamentId !== args.tournamentId) {
      throw new Error("Team not found in this tournament.");
    }
    // Check for existing override
    const existing = await ctx.db
      .query("pointsOverrides")
      .withIndex("by_tournament_team", (q) =>
        q.eq("tournamentId", args.tournamentId).eq("teamId", args.teamId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        played: args.played ?? undefined,
        won: args.won ?? undefined,
        lost: args.lost ?? undefined,
        tied: args.tied ?? undefined,
        points: args.points ?? undefined,
        nrr: args.nrr ?? undefined,
      });
    } else {
      await ctx.db.insert("pointsOverrides", {
        tournamentId: args.tournamentId,
        teamId: args.teamId,
        played: args.played ?? undefined,
        won: args.won ?? undefined,
        lost: args.lost ?? undefined,
        tied: args.tied ?? undefined,
        points: args.points ?? undefined,
        nrr: args.nrr ?? undefined,
      });
    }
    return { ok: true };
  },
});

/**
 * Clear all points overrides for a tournament (revert to computed values).
 */
export const clearPointsOverrides = mutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx, args.tournamentId);
    const overrides = await ctx.db
      .query("pointsOverrides")
      .withIndex("by_tournament_team", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
    for (const o of overrides) await ctx.db.delete(o._id);
    return { ok: true, deleted: overrides.length };
  },
});
