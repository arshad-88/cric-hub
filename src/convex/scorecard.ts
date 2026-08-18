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
  aggregatePartnerships,
  buildBallSymbol,
  buildCommentary,
  computeMatchResult,
  dlsParScore,
  formatOvers,
  isInningsComplete,
  isLegalBall,
  isSuperOverComplete,
  matchPrediction,
  matchWinnerTeamId,
  requiredRunRate,
  runRate,
  superOverWinnerId,
} from "./cricket";
import { EXTRA_TYPE, WICKET_TYPE } from "./schema";
import type { WicketType } from "./schema";

export interface PlayerLite {
  _id: Id<"players">;
  name: string;
  role: "Batsman" | "Bowler" | "All-rounder" | "Wicketkeeper";
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
      return fielderName ? `run out (${fielderName})` : "run out";
    case WICKET_TYPE.HIT_WICKET:
      return `hit wicket b ${bowlerName ?? "?"}`;
    case WICKET_TYPE.OBSTRUCTING:
      return `obstructing the field`;
    case WICKET_TYPE.TIMED_OUT:
      return `timed out`;
    case WICKET_TYPE.RETIRED_HURT:
      return `retired hurt`;
    case WICKET_TYPE.RETIRED_OUT:
      return `retired out`;
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
      // extra per-bowler columns: dot balls, wides and no-balls conceded
      const bowlerDetail = new Map<string, { dots: number; wides: number; noballs: number }>();
      for (const d of deliveries) {
        let e = bowlerDetail.get(d.bowlerId);
        if (!e) {
          e = { dots: 0, wides: 0, noballs: 0 };
          bowlerDetail.set(d.bowlerId, e);
        }
        if (isLegalBall(d.extraType) && !d.isWicket && d.totalRuns === 0) e.dots += 1;
        if (d.extraType === EXTRA_TYPE.WIDE) e.wides += d.extraRuns;
        if (d.extraType === EXTRA_TYPE.NOBALL) e.noballs += d.extraRuns;
      }
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
          dots: bowlerDetail.get(b.playerId)?.dots ?? 0,
          wides: bowlerDetail.get(b.playerId)?.wides ?? 0,
          noballs: bowlerDetail.get(b.playerId)?.noballs ?? 0,
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
          // extra fields so the scorer's live popups can show who did what
          batsmanId: d.batsmanId,
          batsmanName: playerMap.get(d.batsmanId)?.name ?? "?",
          runsScored: d.runsScored,
          extraType: d.extraType,
          dismissedBatterId: d.dismissedBatterId,
          newBatsmanId: d.newBatsmanId,
          wicketType: d.wicketType,
        };
      });

      // ---- fall of wickets -------------------------------------------------
      const fow: {
        score: number;
        wickets: number;
        overLabel: string;
        batterName: string;
      }[] = [];
      {
        let run = 0;
        let wkts = 0;
        for (const d of deliveries) {
          run += d.totalRuns;
          if (d.isWicket) {
            wkts += 1;
            fow.push({
              score: run,
              wickets: wkts,
              overLabel: `${d.overNumber}.${d.ballNumber}`,
              batterName: d.dismissedBatterId
                ? playerMap.get(d.dismissedBatterId)?.name ?? "?"
                : playerMap.get(d.batsmanId)?.name ?? "?",
            });
          }
        }
      }

      // ---- partnerships ------------------------------------------------------
      const rawParts = aggregatePartnerships(
        deliveries,
        inn.openingStrikerId,
        inn.openingNonStrikerId,
      );
      const partName = (id: string) => playerMap.get(id as Id<"players">)?.name ?? "?";
      const parts = {
        list: rawParts.list.map((p) => ({
          runs: p.runs,
          balls: p.balls,
          batters: p.pair.map(partName),
        })),
        current: rawParts.current
          ? {
              runs: rawParts.current.runs,
              balls: rawParts.current.balls,
              batters: rawParts.current.pair.map(partName),
            }
          : null,
        highest: rawParts.highest
          ? {
              runs: rawParts.highest.runs,
              balls: rawParts.highest.balls,
              batters: rawParts.highest.pair.map(partName),
            }
          : null,
      };

      // ---- wagon wheel source (real shot placements only) --------------------
      const wagonWheel = deliveries
        .filter((d) => d.runsScored > 0 && d.shotRegion)
        .map((d) => ({
          overLabel: `${d.overNumber}.${d.ballNumber}`,
          runs: d.runsScored,
          region: d.shotRegion!,
          shotType: d.shotType,
        }));

      // ---- extras breakdown ------------------------------------------------
      const extras = { total: 0, wide: 0, noball: 0, bye: 0, legbye: 0 };
      for (const d of deliveries) {
        extras.total += d.extraRuns;
        if (d.extraType === EXTRA_TYPE.WIDE) extras.wide += d.extraRuns;
        else if (d.extraType === EXTRA_TYPE.NOBALL) extras.noball += d.extraRuns;
        else if (d.extraType === EXTRA_TYPE.BYE) extras.bye += d.extraRuns;
        else if (d.extraType === EXTRA_TYPE.LEGBYE) extras.legbye += d.extraRuns;
      }

      // Bowler who bowled the most recently completed over — used by the
      // scorer to enforce the real-cricket rule that a bowler can't bowl two
      // overs in a row (they're excluded from the next-over picker).
      const legalDeliveries = deliveries.filter((d) => isLegalBall(d.extraType));
      let lastOverBowlerId: Id<"players"> | null = null;
      if (legalDeliveries.length >= 6) {
        const lastCompletedOver = Math.floor(legalDeliveries.length / 6);
        const lastOverRows = deliveries.filter(
          (d) => d.overNumber === lastCompletedOver,
        );
        const lastRow = lastOverRows[lastOverRows.length - 1];
        if (lastRow) lastOverBowlerId = lastRow.bowlerId;
      }

      const isCurrent =
        inn._id === match.currentInningsId ||
        (!match.currentInningsId &&
          inn.number === inningsRows[inningsRows.length - 1]?.number);
      const isComplete =
        (inn.isSuperOver
          ? isSuperOverComplete(inn.wickets, inn.ballsBowled)
          : isInningsComplete(inn.wickets, inn.ballsBowled, match.overs)) ||
        ((inn.number === 2 || inn.number === 4) &&
          inn.target != null &&
          inn.totalRuns >= inn.target);

      // DLS par score for the chasing side (only meaningful once the first
      // innings is complete and the chase is underway / still in progress).
      const firstInn = inningsRows.find((i) => i.number === 1);
      const dlsPar =
        inn.number === 2 && firstInn && !isComplete
          ? dlsParScore(
              {
                totalRuns: firstInn.totalRuns,
                ballsBowled: firstInn.ballsBowled,
                wickets: firstInn.wickets,
              },
              { ballsBowled: inn.ballsBowled, wickets: inn.wickets },
              match.overs,
            )
          : null;

      const ballsLeft =
        inn.target != null ? match.overs * 6 - inn.ballsBowled : null;
      inningsViews.push({
        id: inn._id,
        number: inn.number,
        isSuperOver: inn.isSuperOver ?? false,
        battingTeam: teamLite(battingTeam),
        bowlingTeam: teamLite(bowlingTeam),
        totalRuns: inn.totalRuns,
        wickets: inn.wickets,
        ballsBowled: inn.ballsBowled,
        oversLabel: formatOvers(inn.ballsBowled),
        target: inn.target ?? null,
        dlsPar,
        striker: inn.strikerId ? (playerMap.get(inn.strikerId) ?? null) : null,
        nonStriker: inn.nonStrikerId ? (playerMap.get(inn.nonStrikerId) ?? null) : null,
        bowler: inn.currentBowlerId ? (playerMap.get(inn.currentBowlerId) ?? null) : null,
        lastOverBowlerId,
        batters,
        bowlers,
        recentBalls: ballViews.slice(-8),
        commentary: [...ballViews].reverse(),
        overs: aggregateOvers(deliveries),
        extras,
        fow,
        partnerships: parts,
        wagonWheel,
        needed: inn.target != null ? Math.max(0, inn.target - inn.totalRuns) : null,
        ballsLeft,
        isCurrent,
        isComplete,
        crr: runRate(inn.totalRuns, inn.ballsBowled),
        rrr: requiredRunRate(inn.target, inn.totalRuns, match.overs, inn.ballsBowled),
      });
    }

    const in1 = inningsViews.find((i) => i.number === 1) ?? null;
    const in2 = inningsViews.find((i) => i.number === 2) ?? null;
    const in3 = inningsViews.find((i) => i.number === 3) ?? null;
    const in4 = inningsViews.find((i) => i.number === 4) ?? null;
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

    // ---- outcome predictor -------------------------------------------------
    // League average first-innings total (completed matches of this
    // tournament) — the baseline for in-play projections.
    const allMatches = await ctx.db
      .query("matches")
      .withIndex("by_tournament_status", (q) =>
        q.eq("tournamentId", tournament._id),
      )
      .collect();
    let avgFirstInnings: number | null = null;
    {
      const totals: number[] = [];
      for (const m of allMatches) {
        if (m.status !== "COMPLETED") continue;
        const inns = await ctx.db
          .query("innings")
          .withIndex("by_match", (q) => q.eq("matchId", m._id))
          .collect();
        const f = inns.find((i) => i.number === 1);
        if (f) totals.push(f.totalRuns);
      }
      if (totals.length > 0) {
        avgFirstInnings = totals.reduce((s, x) => s + x, 0) / totals.length;
      }
    }

    const boundariesIn = (inn: NonNullable<typeof in3>) =>
      inn.overs.reduce(
        (s, o) => s + o.balls.filter((b) => b.kind === "boundary").length,
        0,
      );

    let winnerTeamId: string | null = null;
    if (match.status === "COMPLETED" && in1 && in2) {
      if (in3 && in4) {
        winnerTeamId = superOverWinnerId(
          {
            battingTeamId: in3.battingTeam._id,
            totalRuns: in3.totalRuns,
            boundaries: boundariesIn(in3),
          },
          {
            battingTeamId: in4.battingTeam._id,
            totalRuns: in4.totalRuns,
            boundaries: boundariesIn(in4),
          },
        );
      } else {
        winnerTeamId = matchWinnerTeamId(
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
        );
      }
    }

    const currentInnings =
      inningsViews.find((i) => i.isCurrent) ?? inningsViews[inningsViews.length - 1] ?? null;

    const prediction = matchPrediction({
      status: match.status,
      teamAName: teamA.name,
      teamBName: teamB.name,
      battingTeamName: currentInnings?.battingTeam.name ?? null,
      totalOvers: match.overs,
      winnerTeamId:
        winnerTeamId === null
          ? null
          : winnerTeamId === teamA._id
            ? "A"
            : "B",
      in1: in1
        ? {
            totalRuns: in1.totalRuns,
            wickets: in1.wickets,
            ballsBowled: in1.ballsBowled,
          }
        : null,
      in2: in2
        ? {
            totalRuns: in2.totalRuns,
            wickets: in2.wickets,
            ballsBowled: in2.ballsBowled,
            target: in2.target,
          }
        : null,
      dlsPar: in2?.dlsPar ?? null,
      avgFirstInnings,
      result: result ?? null,
      superOver: match.superOver ?? false,
    });

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
        teamAXI: match.teamAXI ?? [],
        teamBXI: match.teamBXI ?? [],
        currentInningsId: match.currentInningsId,
        superOver: match.superOver ?? false,
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
      prediction,
    };
  },
});
