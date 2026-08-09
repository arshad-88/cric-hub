// ---------------------------------------------------------------------------
// scorecard.ts — reactive full scorecard for the public Match Center.
// Convex queries are live subscriptions: any delivery recorded by the scorer
// propagates to every open viewer without a browser refresh.
// ---------------------------------------------------------------------------

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  aggregateBatterStats,
  aggregateBowlerStats,
  aggregateOvers,
  buildBallSymbol,
  buildCommentary,
  computeMatchResult,
  formatOvers,
  isInningsComplete,
  requiredRunRate,
  runRate,
} from "./cricket";
import { EXTRA_TYPE, WICKET_TYPE } from "./schema";
import type { WicketType } from "./schema";

export interface PlayerLite {
  _id: Id<"players">;
  name: string;
  role: "Batsman" | "Bowler" | "All-rounder";
}

export interface TeamLite {
  _id: Id<"teams">;
  name: string;
  shortCode: string;
  color: string;
}

function dismissalText(
  wicketType: WicketType,
  bowlerName?: string,
  fielderName?: string,
): string {
  switch (wicketType) {
    case WICKET_TYPE.BOWLED:
      return `b ${bowlerName ?? "?"}`;
    case WICKET_TYPE.CAUGHT:
      return fielderName
        ? `c ${fielderName} b ${bowlerName ?? "?"}`
        : `c & b ${bowlerName ?? "?"}`;
    case WICKET_TYPE.STUMPED:
      return fielderName
        ? `st ${fielderName} b ${bowlerName ?? "?"}`
        : `st b ${bowlerName ?? "?"}`;
    case WICKET_TYPE.LBW:
      return `lbw b ${bowlerName ?? "?"}`;
    case WICKET_TYPE.RUN_OUT:
    default:
      return fielderName ? `run out (${fielderName})` : "run out";
  }
}

export const get = query({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    if (!match) return null;

    const [teamA, teamB, tournament] = await Promise.all([
      ctx.db.get(match.teamAId),
      ctx.db.get(match.teamBId),
      ctx.db.get(match.tournamentId),
    ]);
    if (!teamA || !teamB || !tournament) return null;

    const teamLite = (t: typeof teamA): TeamLite => ({
      _id: t._id,
      name: t.name,
      shortCode: t.shortCode,
      color: t.color,
    });

    const inningsRows = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    inningsRows.sort((a, b) => a.number - b.number);

    const inningsViews = [];
    for (const inn of inningsRows) {
      const deliveries = await ctx.db
        .query("deliveries")
        .withIndex("by_innings", (q) => q.eq("inningsId", inn._id))
        .collect();
      deliveries.sort((a, b) => {
        if (a.overNumber !== b.overNumber) return a.overNumber - b.overNumber;
        if (a.ballNumber !== b.ballNumber) return a.ballNumber - b.ballNumber;
        return a._creationTime - b._creationTime;
      });

      const battingTeam = await ctx.db.get(inn.battingTeamId);
      const bowlingTeam = await ctx.db.get(inn.bowlingTeamId);
      if (!battingTeam || !bowlingTeam) continue;

      // gather every referenced player
      const playerIds = new Set<Id<"players">>();
      for (const d of deliveries) {
        playerIds.add(d.bowlerId);
        playerIds.add(d.batsmanId);
        if (d.nonStrikerId) playerIds.add(d.nonStrikerId);
        if (d.dismissedBatterId) playerIds.add(d.dismissedBatterId);
        if (d.fielderId) playerIds.add(d.fielderId);
      }
      if (inn.strikerId) playerIds.add(inn.strikerId);
      if (inn.nonStrikerId) playerIds.add(inn.nonStrikerId);
      if (inn.currentBowlerId) playerIds.add(inn.currentBowlerId);
      const playerDocs = (
        await Promise.all([...playerIds].map((id) => ctx.db.get(id)))
      ).filter((p) => p !== null);
      const playerMap = new Map(playerDocs.map((p) => [p!._id, p!]));

      const batterAgg = aggregateBatterStats(deliveries);
      const bowlerAgg = aggregateBowlerStats(deliveries);

      // ---- batters view ---------------------------------------------------
      const firstAppearance = new Map<string, number>();
      deliveries.forEach((d, i) => {
        if (!firstAppearance.has(d.batsmanId)) firstAppearance.set(d.batsmanId, i);
      });
      const batters = [...batterAgg.values()].sort((a, b) => {
        const isA = a.playerId === inn.strikerId;
        const isB = b.playerId === inn.strikerId;
        if (isA !== isB) return isA ? -1 : 1;
        const na = a.playerId === inn.nonStrikerId;
        const nb = b.playerId === inn.nonStrikerId;
        if (na !== nb) return na ? -1 : 1;
        return (firstAppearance.get(a.playerId) ?? 999) -
          (firstAppearance.get(b.playerId) ?? 999);
      }).map((b) => {
        const player = playerMap.get(b.playerId);
        let dismissalTextOut: string | null = null;
        let status: "batting" | "out" | "notOut" = "notOut";
        if (b.dismissal) {
          status = "out";
          const bowler = b.dismissal.bowlerId
            ? playerMap.get(b.dismissal.bowlerId)
            : undefined;
          const fielder = b.dismissal.fielderId
            ? playerMap.get(b.dismissal.fielderId)
            : undefined;
          dismissalTextOut = dismissalText(
            b.dismissal.wicketType,
            bowler?.name,
            fielder?.name,
          );
        } else if (b.playerId === inn.strikerId || b.playerId === inn.nonStrikerId) {
          status = "batting";
        }
        return {
          playerId: b.playerId,
          name: player?.name ?? "Unknown",
          role: player?.role ?? "Batsman",
          runs: b.runs,
          balls: b.balls,
          fours: b.fours,
          sixes: b.sixes,
          sr: b.balls > 0 ? Number(((b.runs / b.balls) * 100).toFixed(1)) : 0,
          status,
          dismissalText: dismissalTextOut,
          isStriker: b.playerId === inn.strikerId,
          isNonStriker: b.playerId === inn.nonStrikerId,
        };
      });

      // ---- bowlers view ---------------------------------------------------
      const bowlers = [...bowlerAgg.values()]
        .filter((b) => b.balls > 0)
        .sort((a, b) => b.balls - a.balls || b.wickets - a.wickets)
        .map((b) => ({
          playerId: b.playerId,
          name: playerMap.get(b.playerId)?.name ?? "Unknown",
          overs: formatOvers(b.balls),
          maidens: b.maidens,
          runs: b.runs,
          wickets: b.wickets,
          econ: runRate(b.runs, b.balls),
        }));

      // ---- recent balls + commentary --------------------------------------
      const ballViews = deliveries.map((d) => {
        const sym = buildBallSymbol(d);
        const text = d.commentary || buildCommentary(d, {
          bowler: playerMap.get(d.bowlerId)?.name ?? "?",
          batsman: playerMap.get(d.batsmanId)?.name ?? "?",
          dismissed: d.dismissedBatterId
            ? playerMap.get(d.dismissedBatterId)?.name
            : undefined,
          fielder: d.fielderId ? playerMap.get(d.fielderId)?.name : undefined,
        });
        return {
          key: d._id,
          overLabel: `${d.overNumber}.${d.ballNumber}`,
          symbol: sym.symbol,
          kind: sym.kind,
          text,
          isWicket: d.isWicket,
        };
      });

      // ---- extras breakdown ------------------------------------------------
      const extras = { total: 0, wide: 0, noball: 0, bye: 0, legbye: 0 };
      for (const d of deliveries) {
        extras.total += d.extraRuns;
        if (d.extraType === EXTRA_TYPE.WIDE) extras.wide += d.extraRuns;
        else if (d.extraType === EXTRA_TYPE.NOBALL) extras.noball += d.extraRuns;
        else if (d.extraType === EXTRA_TYPE.BYE) extras.bye += d.extraRuns;
        else if (d.extraType === EXTRA_TYPE.LEGBYE) extras.legbye += d.extraRuns;
      }

      const isCurrent =
        inn._id === match.currentInningsId ||
        (!match.currentInningsId &&
          inn.number === inningsRows[inningsRows.length - 1]?.number);
      const isComplete =
        isInningsComplete(inn.wickets, inn.ballsBowled, match.overs) ||
        (inn.number === 2 &&
          inn.target != null &&
          inn.totalRuns >= inn.target);

      inningsViews.push({
        id: inn._id,
        number: inn.number,
        battingTeam: teamLite(battingTeam),
        bowlingTeam: teamLite(bowlingTeam),
        totalRuns: inn.totalRuns,
        wickets: inn.wickets,
        ballsBowled: inn.ballsBowled,
        oversLabel: formatOvers(inn.ballsBowled),
        target: inn.target ?? null,
        striker: inn.strikerId ? (playerMap.get(inn.strikerId) ?? null) : null,
        nonStriker: inn.nonStrikerId ? (playerMap.get(inn.nonStrikerId) ?? null) : null,
        bowler: inn.currentBowlerId ? (playerMap.get(inn.currentBowlerId) ?? null) : null,
        batters,
        bowlers,
        recentBalls: ballViews.slice(-8),
        commentary: [...ballViews].reverse(),
        overs: aggregateOvers(deliveries),
        extras,
        isCurrent,
        isComplete,
        crr: runRate(inn.totalRuns, inn.ballsBowled),
        rrr: requiredRunRate(inn.target, inn.totalRuns, match.overs, inn.ballsBowled),
      });
    }

    const in1 = inningsViews.find((i) => i.number === 1) ?? null;
    const in2 = inningsViews.find((i) => i.number === 2) ?? null;
    const result =
      match.result ??
      (match.status === "COMPLETED" && in1 && in2
        ? computeMatchResult(
            { batting1: in1.battingTeam.name, batting2: in2.battingTeam.name },
            {
              battingTeamId: in1.battingTeam._id,
              totalRuns: in1.totalRuns,
              wickets: in1.wickets,
              ballsBowled: in1.ballsBowled,
              target: in1.target ?? undefined,
            },
            {
              battingTeamId: in2.battingTeam._id,
              totalRuns: in2.totalRuns,
              wickets: in2.wickets,
              ballsBowled: in2.ballsBowled,
              target: in2.target ?? undefined,
            },
          )
        : null);

    const currentInnings =
      inningsViews.find((i) => i.isCurrent) ?? inningsViews[inningsViews.length - 1] ?? null;

    return {
      match: {
        id: match._id,
        status: match.status,
        overs: match.overs,
        venue: match.venue,
        stage: match.stage,
        startTime: match.startTime,
        streamUrl: match.streamUrl,
        result,
        tossWinnerId: match.tossWinnerId,
        tossDecision: match.tossDecision,
        currentInningsId: match.currentInningsId,
      },
      tournament: {
        id: tournament._id,
        name: tournament.name,
        year: tournament.year,
      },
      teamA: teamLite(teamA),
      teamB: teamLite(teamB),
      innings: inningsViews,
      currentInningsId: match.currentInningsId,
      currentInnings,
      result,
      live: match.status === "LIVE",
    };
  },
});
