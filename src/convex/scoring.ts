// ---------------------------------------------------------------------------
// scoring.ts — interactive scorer mutations (Role B: Admin / Ground Scorer).
// Every ball recorded here instantly propagates to public viewers through
// Convex's reactive query subscriptions.
// ---------------------------------------------------------------------------

import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireOrganizer } from "./helpers";
import {
  aggregatePartnerships,
  BATTER_MILESTONES,
  BOWLER_HAULS,
  bowlerCredited,
  buildCommentary,
  computeMatchResult,
  computeSuperOverResult,
  countBoundaries,
  isHatTrick,
  isInningsComplete,
  isLegalBall,
  isSuperOverComplete,
  PARTNERSHIP_MILESTONES,
  reachedMilestone,
  replayCrease,
  superOverWinnerId,
  TEAM_MILESTONES,
} from "./cricket";
import type { DeliveryLike } from "./cricket";
import { EXTRA_TYPE, extraTypeValidator, wicketTypeValidator } from "./schema";
import type { MutationCtx } from "./_generated/server";

async function getDeliveries(
  ctx: MutationCtx,
  inningsId: Id<"innings">,
): Promise<(DeliveryLike & { _id: Id<"deliveries">; _creationTime: number })[]> {
  const rows = await ctx.db
    .query("deliveries")
    .withIndex("by_innings", (q) => q.eq("inningsId", inningsId))
    .collect();
  return rows.sort((a, b) => a._creationTime - b._creationTime);
}

/** Recompute an innings row from its deliveries (single source of truth). */
async function recomputeInnings(ctx: MutationCtx, inningsId: Id<"innings">) {
  const inn = await ctx.db.get(inningsId);
  if (!inn) return null;
  const deliveries = await getDeliveries(ctx, inningsId);
  const totalRuns = deliveries.reduce((s, d) => s + d.totalRuns, 0);
  const wickets = deliveries.filter((d) => d.isWicket).length;
  const ballsBowled = deliveries.filter((d) => isLegalBall(d.extraType)).length;
  const crease = replayCrease(
    deliveries,
    inn.openingStrikerId,
    inn.openingNonStrikerId,
  );
  await ctx.db.patch(inn._id, {
    totalRuns,
    wickets,
    ballsBowled,
    strikerId: crease.strikerId,
    nonStrikerId: crease.nonStrikerId,
  });
  return {
    inn: {
      ...inn,
      totalRuns,
      wickets,
      ballsBowled,
      strikerId: crease.strikerId,
      nonStrikerId: crease.nonStrikerId,
    },
    deliveries,
  };
}

async function assertPlayerInTeam(
  ctx: MutationCtx,
  playerId: Id<"players">,
  teamId: Id<"teams">,
  label: string,
) {
  const p = await ctx.db.get(playerId);
  if (!p || p.teamId !== teamId) {
    throw new Error(`${label} is not in the expected team.`);
  }
  return p;
}

/**
 * Start a fresh innings: innings 1 on an UPCOMING match, or innings 2 once
 * innings 1 is complete. Scorer supplies the opening pair and first bowler.
 */
export const startInnings = mutation({
  args: {
    matchId: v.id("matches"),
    battingTeamId: v.id("teams"),
    bowlingTeamId: v.id("teams"),
    strikerId: v.id("players"),
    nonStrikerId: v.id("players"),
    bowlerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    if (args.battingTeamId === args.bowlingTeamId) {
      throw new Error("A team cannot bat and bowl to itself.");
    }
    if (match.teamAId !== args.battingTeamId && match.teamBId !== args.battingTeamId) {
      throw new Error("Batting team is not part of this match.");
    }

    const existing = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .collect();
    existing.sort((a, b) => a.number - b.number);

    const in1 = existing.find((i) => i.number === 1);
    const in2 = existing.find((i) => i.number === 2);

    let inningsNumber: number;
    if (existing.length === 0) {
      inningsNumber = 1;
    } else if (existing.length === 1 && in1) {
      if (!isInningsComplete(in1.wickets, in1.ballsBowled, match.overs)) {
        throw new Error("The current innings is still in progress.");
      }
      if (args.battingTeamId !== in1.bowlingTeamId) {
        throw new Error("The chasing team must be the side that bowled first.");
      }
      inningsNumber = 2;
    } else if (existing.length === 2 && in1 && in2 && match.superOver) {
      // Tied match → Super Over. The side that batted second bats first.
      const so1 = existing.find((i) => i.number === 3);
      if (!so1) {
        if (!isInningsComplete(in2.wickets, in2.ballsBowled, match.overs)) {
          throw new Error("The current innings is still in progress.");
        }
        if (args.battingTeamId !== in2.battingTeamId) {
          throw new Error("Super Over: the team that batted second bats first.");
        }
        inningsNumber = 3;
      } else {
        if (!isSuperOverComplete(so1.wickets, so1.ballsBowled)) {
          throw new Error("The Super Over is still in progress.");
        }
        if (args.battingTeamId !== in1.battingTeamId) {
          throw new Error("Super Over: the team that batted first chases.");
        }
        inningsNumber = 4;
      }
    } else {
      throw new Error("This match already has two innings.");
    }

    await assertPlayerInTeam(ctx, args.strikerId, args.battingTeamId, "Striker");
    await assertPlayerInTeam(ctx, args.nonStrikerId, args.battingTeamId, "Non-striker");
    await assertPlayerInTeam(ctx, args.bowlerId, args.bowlingTeamId, "Bowler");
    if (args.strikerId === args.nonStrikerId) {
      throw new Error("Striker and non-striker must be different players.");
    }

    const so1 = existing.find((i) => i.number === 3);
    const target =
      inningsNumber === 2
        ? in1!.totalRuns + 1
        : inningsNumber === 4
          ? so1!.totalRuns + 1
          : undefined;
    const inningsId = await ctx.db.insert("innings", {
      matchId: match._id,
      number: inningsNumber,
      battingTeamId: args.battingTeamId,
      bowlingTeamId: args.bowlingTeamId,
      totalRuns: 0,
      wickets: 0,
      ballsBowled: 0,
      target,
      isSuperOver: inningsNumber >= 3 ? true : undefined,
      openingStrikerId: args.strikerId,
      openingNonStrikerId: args.nonStrikerId,
      strikerId: args.strikerId,
      nonStrikerId: args.nonStrikerId,
      currentBowlerId: args.bowlerId,
    });

    await ctx.db.patch(match._id, {
      status: "LIVE",
      currentInningsId: inningsId,
      result: undefined,
    });

    if (inningsNumber === 1) {
      const [bt, bw] = await Promise.all([
        ctx.db.get(args.battingTeamId),
        ctx.db.get(args.bowlingTeamId),
      ]);
      await ctx.runMutation(internal.notifications.recordEvent, {
        matchId: match._id,
        type: "live",
        title: "MATCH LIVE!",
        message: `${bt?.name ?? "?"} v ${bw?.name ?? "?"} — the first ball is coming up`,
      });
    } else if (inningsNumber === 3) {
      const [bt, bw] = await Promise.all([
        ctx.db.get(args.battingTeamId),
        ctx.db.get(args.bowlingTeamId),
      ]);
      await ctx.runMutation(internal.notifications.recordEvent, {
        matchId: match._id,
        type: "superover",
        title: "SUPER OVER!",
        message: `${bt?.name ?? "?"} take on ${bw?.name ?? "?"} — one over each, all to play for`,
      });
    }
    return { inningsId, number: inningsNumber };
  },
});

/** Set/repair the crease state on a fresh innings (used when innings 2 opens). */
export const setOpenersAndBowler = mutation({
  args: {
    inningsId: v.id("innings"),
    strikerId: v.id("players"),
    nonStrikerId: v.id("players"),
    bowlerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const inn = await ctx.db.get(args.inningsId);
    if (!inn) throw new Error("Innings not found");
    const matchForGate = await ctx.db.get(inn.matchId);
    if (!matchForGate) throw new Error("Match not found");
    await requireOrganizer(ctx, matchForGate.tournamentId);
    const deliveries = await getDeliveries(ctx, inn._id);
    if (deliveries.length > 0) {
      throw new Error("Cannot change the openers after the innings has begun.");
    }
    await assertPlayerInTeam(ctx, args.strikerId, inn.battingTeamId, "Striker");
    await assertPlayerInTeam(ctx, args.nonStrikerId, inn.battingTeamId, "Non-striker");
    await assertPlayerInTeam(ctx, args.bowlerId, inn.bowlingTeamId, "Bowler");
    if (args.strikerId === args.nonStrikerId) {
      throw new Error("Striker and non-striker must be different players.");
    }
    await ctx.db.patch(inn._id, {
      openingStrikerId: args.strikerId,
      openingNonStrikerId: args.nonStrikerId,
      strikerId: args.strikerId,
      nonStrikerId: args.nonStrikerId,
      currentBowlerId: args.bowlerId,
    });
    const match = await ctx.db.get(inn.matchId);
    if (match && match.status !== "LIVE") {
      await ctx.db.patch(match._id, { status: "LIVE", result: undefined });
    }
    return { inningsId: inn._id };
  },
});

/** Change the bowler (start of a new over). */
export const setBowler = mutation({
  args: { inningsId: v.id("innings"), bowlerId: v.id("players") },
  handler: async (ctx, { inningsId, bowlerId }) => {
    const inn = await ctx.db.get(inningsId);
    if (!inn) throw new Error("Innings not found");
    const matchForGate = await ctx.db.get(inn.matchId);
    if (!matchForGate) throw new Error("Match not found");
    await requireOrganizer(ctx, matchForGate.tournamentId);
    await assertPlayerInTeam(ctx, bowlerId, inn.bowlingTeamId, "Bowler");
    await ctx.db.patch(inningsId, { currentBowlerId: bowlerId });
    return inningsId;
  },
});

/** Manual correction of who is at the crease. */
export const setBatsmen = mutation({
  args: {
    inningsId: v.id("innings"),
    strikerId: v.id("players"),
    nonStrikerId: v.id("players"),
  },
  handler: async (ctx, { inningsId, strikerId, nonStrikerId }) => {
    const inn = await ctx.db.get(inningsId);
    if (!inn) throw new Error("Innings not found");
    const matchForGate = await ctx.db.get(inn.matchId);
    if (!matchForGate) throw new Error("Match not found");
    await requireOrganizer(ctx, matchForGate.tournamentId);
    await assertPlayerInTeam(ctx, strikerId, inn.battingTeamId, "Striker");
    await assertPlayerInTeam(ctx, nonStrikerId, inn.battingTeamId, "Non-striker");
    if (strikerId === nonStrikerId) {
      throw new Error("Striker and non-striker must be different players.");
    }
    await ctx.db.patch(inningsId, { strikerId, nonStrikerId });
    return inningsId;
  },
});

/**
 * Record one delivery. The core scorer action — validates the ball, updates
 * the innings totals and crease, auto-completes the innings / match.
 */
export const recordDelivery = mutation({
  args: {
    matchId: v.id("matches"),
    inningsId: v.id("innings"),
    bowlerId: v.id("players"),
    batsmanId: v.id("players"),
    nonStrikerId: v.optional(v.id("players")),
    runsScored: v.number(),
    extraType: extraTypeValidator,
    extraRuns: v.number(),
    isWicket: v.boolean(),
    wicketType: v.optional(wicketTypeValidator),
    dismissedBatterId: v.optional(v.id("players")),
    fielderId: v.optional(v.id("players")),
    newBatsmanId: v.optional(v.id("players")),
    shotRegion: v.optional(v.string()), // scoring-shot placement for the wagon wheel
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    if (match.status !== "LIVE") throw new Error("The match is not live.");
    const inn = await ctx.db.get(args.inningsId);
    if (!inn || inn.matchId !== match._id) {
      throw new Error("Innings does not belong to this match.");
    }

    // ---- load current state (before validation) ---------------------------
    const deliveries = await getDeliveries(ctx, inn._id);
    const wktsSoFar = deliveries.filter((d) => d.isWicket).length;
    const oversAllocated = inn.isSuperOver ? 1 : match.overs;
    if (
      inn.isSuperOver
        ? isSuperOverComplete(wktsSoFar, inn.ballsBowled)
        : isInningsComplete(wktsSoFar, inn.ballsBowled, oversAllocated)
    ) {
      throw new Error("This innings is already complete.");
    }
    if (
      (inn.number === 2 || inn.number === 4) &&
      inn.target != null &&
      inn.totalRuns >= inn.target
    ) {
      throw new Error("The chase is already complete.");
    }

    // ---- validation -------------------------------------------------------
    if (args.runsScored < 0 || args.runsScored > 6 || args.extraRuns < 0) {
      throw new Error("Invalid run count.");
    }
    if (args.extraType === EXTRA_TYPE.NONE) {
      if (args.extraRuns !== 0) throw new Error("A legal ball carries no extras.");
    } else if (args.extraType === EXTRA_TYPE.WIDE) {
      if (args.runsScored !== 0) throw new Error("Runs off a wide are extras, not batter runs.");
      if (args.extraRuns < 1) throw new Error("A wide is worth at least 1 run.");
    } else if (args.extraType === EXTRA_TYPE.NOBALL) {
      if (args.extraRuns < 1) throw new Error("A no-ball is worth at least 1 run.");
    } else {
      if (args.runsScored !== 0) throw new Error("Byes are not credited to the batter.");
      if (args.extraRuns < 1) throw new Error("Byes must be at least 1 run.");
    }
    if (args.isWicket) {
      if (!args.wicketType || !args.dismissedBatterId) {
        throw new Error("A wicket needs a type and the dismissed batter.");
      }
      // The 10th wicket ends the innings, so no replacement is required.
      if (wktsSoFar + 1 < 10 && !args.newBatsmanId) {
        throw new Error("Pick the replacement batter who comes in next.");
      }
    } else if (args.wicketType || args.dismissedBatterId || args.newBatsmanId || args.fielderId) {
      throw new Error("Wicket details supplied without a wicket.");
    }

    await assertPlayerInTeam(ctx, args.bowlerId, inn.bowlingTeamId, "Bowler");
    await assertPlayerInTeam(ctx, args.batsmanId, inn.battingTeamId, "Batter");
    if (args.nonStrikerId) {
      await assertPlayerInTeam(ctx, args.nonStrikerId, inn.battingTeamId, "Non-striker");
    }
    if (args.newBatsmanId) {
      await assertPlayerInTeam(ctx, args.newBatsmanId, inn.battingTeamId, "Replacement batter");
    }

    // ---- ball numbering (legal balls only) --------------------------------
    const last = deliveries[deliveries.length - 1];
    let overNumber = 1;
    if (last) {
      const legalInLastOver = deliveries.filter(
        (d) => d.overNumber === last.overNumber && isLegalBall(d.extraType),
      ).length;
      overNumber = legalInLastOver >= 6 ? last.overNumber + 1 : last.overNumber;
    }
    const ballNumber =
      deliveries.filter(
        (d) => d.overNumber === overNumber && isLegalBall(d.extraType),
      ).length + 1;

    const totalRuns = args.runsScored + args.extraRuns;
    const [bowlerDoc, batsmanDoc, dismissedDoc, fielderDoc] =
      await Promise.all([
        ctx.db.get(args.bowlerId),
        ctx.db.get(args.batsmanId),
        args.dismissedBatterId ? ctx.db.get(args.dismissedBatterId) : null,
        args.fielderId ? ctx.db.get(args.fielderId) : null,
      ]);

    // ---- pre-ball context (commentary + milestone detection) ----------------
    const overLabel = `${overNumber}.${ballNumber}`;
    const teamRunsBefore = deliveries.reduce((s, d) => s + d.totalRuns, 0);
    const teamWicketsBefore = deliveries.filter((d) => d.isWicket).length;
    const batterRunsBefore = deliveries
      .filter((d) => d.batsmanId === args.batsmanId)
      .reduce((s, d) => s + d.runsScored, 0);
    const teamRunsAfter = teamRunsBefore + totalRuns;
    const batterRunsAfter = batterRunsBefore + args.runsScored;
    const ballsLeft = oversAllocated * 6 - inn.ballsBowled;

    let dotsBefore = 0;
    for (let i = deliveries.length - 1; i >= 0; i--) {
      const p = deliveries[i];
      if (p.totalRuns === 0 && isLegalBall(p.extraType)) dotsBefore += 1;
      else break;
    }
    const legalTail = deliveries.filter((d) => isLegalBall(d.extraType)).slice(-2);
    const isHatTrickBall =
      legalTail.length === 2 &&
      legalTail.every((d) => d.isWicket && d.bowlerId === args.bowlerId);
    const freeHit =
      deliveries.length > 0 &&
      deliveries[deliveries.length - 1].extraType === EXTRA_TYPE.NOBALL;

    const newDelivery: DeliveryLike = {
      ...args,
      overNumber,
      ballNumber,
      totalRuns,
      isWicket: args.isWicket,
    };
    const commentary = buildCommentary(
      newDelivery,
      {
        bowler: bowlerDoc?.name ?? "?",
        batsman: batsmanDoc?.name ?? "?",
        dismissed: dismissedDoc?.name,
        fielder: fielderDoc?.name,
      },
      {
        overLabel,
        teamRuns: teamRunsAfter,
        teamWickets: teamWicketsBefore + (args.isWicket ? 1 : 0),
        target: inn.target ?? null,
        ballsLeft,
        isHatTrickBall,
        dotsBefore,
        freeHit,
      },
    );

    await ctx.db.insert("deliveries", {
      matchId: match._id,
      inningsId: inn._id,
      overNumber,
      ballNumber,
      bowlerId: args.bowlerId,
      batsmanId: args.batsmanId,
      nonStrikerId: args.nonStrikerId,
      runsScored: args.runsScored,
      extraType: args.extraType,
      extraRuns: args.extraRuns,
      totalRuns,
      isWicket: args.isWicket,
      wicketType: args.wicketType,
      dismissedBatterId: args.dismissedBatterId,
      fielderId: args.fielderId,
      newBatsmanId: args.newBatsmanId,
      shotRegion: args.shotRegion,
      commentary,
    });

    const rec = await recomputeInnings(ctx, inn._id);
    if (!rec) throw new Error("Innings disappeared.");
    const { totalRuns: runsNow, wickets: wktsNow, ballsBowled: ballsNow } = rec.inn;

    const teamNameOf = async (teamId: Id<"teams">) =>
      (await ctx.db.get(teamId))?.name ?? "?";
    const event = (args: {
      type: "wicket" | "milestone" | "team_milestone";
      title: string;
      message: string;
    }) =>
      ctx.runMutation(internal.notifications.recordEvent, {
        matchId: match._id,
        type: args.type,
        title: args.title,
        message: args.message,
        overLabel,
        inningsNumber: inn.number,
      });

    // ---- wicket -------------------------------------------------------------
    if (args.isWicket) {
      await event({
        type: "wicket",
        title: "WICKET!",
        message: commentary,
      });
    }

    // ---- batter milestones: 25 / 50 / 75 / 100 / 150 / 200 -------------------
    const batterM = reachedMilestone(BATTER_MILESTONES, batterRunsBefore, batterRunsAfter);
    if (batterM) {
      const title =
        batterM === 50
          ? "FIFTY!"
          : batterM === 100
            ? "CENTURY!"
            : `${batterM} UP!`;
      await event({
        type: "milestone",
        title,
        message: `${batsmanDoc?.name ?? "?"} brings up ${batterM} — off ${
          deliveries.filter((d) => d.batsmanId === args.batsmanId && isLegalBall(d.extraType)).length + (isLegalBall(args.extraType) ? 1 : 0)
        } balls`,
      });
    }

    // ---- bowler hauls: 3 / 4 / 5 / 6 wickets ---------------------------------
    const bowlerWktsBefore = deliveries.filter(
      (d) => d.bowlerId === args.bowlerId && bowlerCredited(d),
    ).length;
    const bowlerWktsAfter =
      bowlerWktsBefore + (bowlerCredited(newDelivery) ? 1 : 0);
    const haul = reachedMilestone(BOWLER_HAULS, bowlerWktsBefore, bowlerWktsAfter);
    if (haul) {
      await event({
        type: "milestone",
        title: `${haul}-WICKET HAUL!`,
        message: `${bowlerDoc?.name ?? "?"} has ${haul} wickets — ${teamRunsAfter}/${teamWicketsBefore + (args.isWicket ? 1 : 0)}`,
      });
    }

    // ---- hat-trick ball + hat-trick ------------------------------------------
    if (isHatTrickBall) {
      await event({
        type: "milestone",
        title: "HAT-TRICK BALL!",
        message: `${bowlerDoc?.name ?? "?"} took two in two — can he complete the hat-trick?`,
      });
    }
    if (args.isWicket && isHatTrick([...deliveries, newDelivery])) {
      await event({
        type: "milestone",
        title: "HAT-TRICK!",
        message: `${bowlerDoc?.name ?? "?"} — three wickets in three balls! INCREDIBLE!`,
      });
    }

    // ---- partnership milestones: 50 / 100 / 150 -------------------------------
    const partsBefore = aggregatePartnerships(
      deliveries,
      inn.openingStrikerId,
      inn.openingNonStrikerId,
    );
    const partsAfter = aggregatePartnerships(
      [...deliveries, newDelivery],
      inn.openingStrikerId,
      inn.openingNonStrikerId,
    );
    const pBefore = partsBefore.current?.runs ?? 0;
    const pAfter = partsAfter.current?.runs ?? 0;
    const pM = reachedMilestone(PARTNERSHIP_MILESTONES, pBefore, pAfter);
    if (pM) {
      const partnerId = partsAfter.current?.pair.find((id) => id !== args.batsmanId);
      const partnerDoc = partnerId ? await ctx.db.get(partnerId as Id<"players">) : null;
      await event({
        type: "milestone",
        title: `${pM} PARTNERSHIP!`,
        message: `${batsmanDoc?.name ?? "?"} & ${partnerDoc?.name ?? "?"} — ${pM} runs together`,
      });
    }

    // ---- team milestones: 50 / 100 / 150 / 200 / 250 --------------------------
    const teamM = reachedMilestone(TEAM_MILESTONES, teamRunsBefore, teamRunsAfter);
    if (teamM) {
      const btName = await teamNameOf(inn.battingTeamId);
      await event({
        type: "team_milestone",
        title: `${btName} ${teamM} up`,
        message: `${btName} reach ${teamM} — ${runsNow}/${wktsNow} (${overLabel})`,
      });
    }

    // ---- innings / match completion ----------------------------------------
    const chaseComplete =
      (inn.number === 2 || inn.number === 4) &&
      inn.target != null &&
      runsNow >= inn.target;
    const complete =
      chaseComplete ||
      (inn.isSuperOver
        ? isSuperOverComplete(wktsNow, ballsNow)
        : isInningsComplete(wktsNow, ballsNow, oversAllocated));

    if (complete) {
      if (inn.number === 1) {
        const innings2Id = await ctx.db.insert("innings", {
          matchId: match._id,
          number: 2,
          battingTeamId: inn.bowlingTeamId,
          bowlingTeamId: inn.battingTeamId,
          totalRuns: 0,
          wickets: 0,
          ballsBowled: 0,
          target: runsNow + 1,
          openingStrikerId: undefined,
          openingNonStrikerId: undefined,
          strikerId: undefined,
          nonStrikerId: undefined,
          currentBowlerId: undefined,
        });
        await ctx.db.patch(match._id, { currentInningsId: innings2Id });
        const btName = await teamNameOf(inn.battingTeamId);
        const bwName = await teamNameOf(inn.bowlingTeamId);
        await ctx.runMutation(internal.notifications.recordEvent, {
          matchId: match._id,
          type: "innings",
          title: "INNINGS BREAK",
          message: `${btName} close at ${runsNow}/${wktsNow} — ${bwName} need ${runsNow + 1} to win`,
          overLabel: `${Math.floor(ballsNow / 6)}.${ballsNow % 6}`,
          inningsNumber: 1,
        });
        return { ok: true, inningsComplete: true, nextInningsId: innings2Id };
      }

      if (inn.number === 3) {
        // Super over 1 done → auto-create the super over chase.
        const allSo = await ctx.db
          .query("innings")
          .withIndex("by_match", (q) => q.eq("matchId", match._id))
          .collect();
        const in1So = allSo.find((i) => i.number === 1);
        if (!in1So) throw new Error("Super over innings state is broken.");
        const innings4Id = await ctx.db.insert("innings", {
          matchId: match._id,
          number: 4,
          battingTeamId: in1So.battingTeamId,
          bowlingTeamId: in1So.bowlingTeamId,
          totalRuns: 0,
          wickets: 0,
          ballsBowled: 0,
          target: runsNow + 1,
          isSuperOver: true,
          openingStrikerId: undefined,
          openingNonStrikerId: undefined,
          strikerId: undefined,
          nonStrikerId: undefined,
          currentBowlerId: undefined,
        });
        await ctx.db.patch(match._id, { currentInningsId: innings4Id });
        const btName = await teamNameOf(inn.battingTeamId);
        const bwName = await teamNameOf(in1So.battingTeamId);
        await ctx.runMutation(internal.notifications.recordEvent, {
          matchId: match._id,
          type: "superover",
          title: "SUPER OVER 2",
          message: `${btName} made ${runsNow} — ${bwName} need ${runsNow + 1} off 6 balls`,
          overLabel: `${Math.floor(ballsNow / 6)}.${ballsNow % 6}`,
          inningsNumber: 3,
        });
        return { ok: true, inningsComplete: true, nextInningsId: innings4Id };
      }

      const all = await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .collect();
      const in1 = all.find((i) => i.number === 1);
      const in2 = all.find((i) => i.number === 2);

      if (inn.number === 2 && in1 && in2) {
        const [bat1, bat2] = await Promise.all([
          ctx.db.get(in1.battingTeamId),
          ctx.db.get(in2.battingTeamId),
        ]);
        if (in2.totalRuns === in1.totalRuns) {
          // Tied → Super Over starts internally; the scorer opens it.
          await ctx.db.patch(match._id, {
            status: "LIVE",
            superOver: true,
            result: undefined,
            currentInningsId: inn._id,
          });
          await ctx.runMutation(internal.notifications.recordEvent, {
            matchId: match._id,
            type: "tie",
            title: "MATCH TIED!",
            message: `${bat2?.name ?? "?"} and ${bat1?.name ?? "?"} locked on ${in1.totalRuns} — Super Over incoming!`,
            inningsNumber: 2,
          });
          return { ok: true, inningsComplete: true, superOver: true };
        }
        const result = computeMatchResult(
          { batting1: bat1?.name ?? "?", batting2: bat2?.name ?? "?" },
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
        await ctx.db.patch(match._id, {
          status: "COMPLETED",
          result: result ?? undefined,
          currentInningsId: inn._id,
        });
        await ctx.runMutation(internal.notifications.recordEvent, {
          matchId: match._id,
          type: "result",
          title: "FULL TIME",
          message: result ?? "Match complete",
          inningsNumber: 2,
        });
        return { ok: true, inningsComplete: true, matchComplete: true, result };
      }

      if (inn.number === 4 && in1 && in2) {
        // Super over chase complete → resolve the winner.
        const in3 = all.find((i) => i.number === 3);
        if (!in3) throw new Error("Super over innings state is broken.");
        const b3 = await ctx.db.get(in3.battingTeamId);
        const b4 = await ctx.db.get(inn.battingTeamId);
        const b3Deliveries = await getDeliveries(ctx, in3._id);
        const b4Deliveries = await getDeliveries(ctx, inn._id);
        const winnerId = superOverWinnerId(
          {
            battingTeamId: in3.battingTeamId,
            totalRuns: in3.totalRuns,
            boundaries: countBoundaries(b3Deliveries),
          },
          {
            battingTeamId: inn.battingTeamId,
            totalRuns: runsNow,
            boundaries: countBoundaries(b4Deliveries),
          },
        );
        const result = computeSuperOverResult(
          { batting3: b3?.name ?? "?", batting4: b4?.name ?? "?" },
          { totalRuns: in3.totalRuns, wickets: in3.wickets },
          { totalRuns: runsNow, wickets: wktsNow },
        );
        await ctx.db.patch(match._id, {
          status: "COMPLETED",
          result,
          superOver: true,
          currentInningsId: inn._id,
        });
        await ctx.runMutation(internal.notifications.recordEvent, {
          matchId: match._id,
          type: "result",
          title: "SUPER OVER RESULT",
          message: result,
          inningsNumber: 4,
        });
        return { ok: true, inningsComplete: true, matchComplete: true, result };
      }
    }

    return { ok: true, inningsComplete: false };
  },
});

/**
 * Undo the last ball of the innings — full state rollback via recompute.
 * If the requested innings is empty (e.g. innings 2 was auto-created after
 * innings 1 finished and nothing has been bowled in it yet), it falls back
 * to the most recent innings that actually has balls so the scorer can fix
 * an error made on the final ball of the previous innings.
 */
export const undoLastDelivery = mutation({
  args: { matchId: v.id("matches"), inningsId: v.id("innings") },
  handler: async (ctx, { matchId, inningsId }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    const inn = await ctx.db.get(inningsId);
    if (!inn || inn.matchId !== match._id) {
      throw new Error("Innings does not belong to this match.");
    }

    let target = inn;
    let deliveries = (await getDeliveries(ctx, target._id)).sort(
      (a, b) => b._creationTime - a._creationTime,
    );

    if (deliveries.length === 0) {
      const all = await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .collect();
      const candidates = all
        .filter((i) => i.number < target.number)
        .sort((a, b) => b.number - a.number);
      for (const cand of candidates) {
        const ds = await getDeliveries(ctx, cand._id);
        if (ds.length > 0) {
          // The empty innings was auto-created — remove it and point the
          // match back at the innings whose final ball we are undoing.
          if (target.number > 1) {
            await ctx.db.delete(target._id);
            await ctx.db.patch(match._id, { currentInningsId: cand._id });
          }
          target = cand;
          deliveries = ds.sort((a, b) => b._creationTime - a._creationTime);
          break;
        }
      }
      if (deliveries.length === 0) throw new Error("Nothing to undo — no balls bowled.");
    }

    await ctx.db.delete(deliveries[0]._id);
    const remaining = deliveries.slice(1);

    if (remaining.length === 0) {
      if (target.number === 1) {
        await ctx.db.delete(target._id);
        await ctx.db.patch(match._id, {
          status: "UPCOMING",
          currentInningsId: undefined,
          result: undefined,
        });
      } else {
        const all = await ctx.db
          .query("innings")
          .withIndex("by_match", (q) => q.eq("matchId", match._id))
          .collect();
        // Point back at the previous innings (2 → 1, 3 → 2, 4 → 3).
        const prev = all.find((i) => i.number === target.number - 1);
        await ctx.db.delete(target._id);
        await ctx.db.patch(match._id, {
          status: "LIVE",
          currentInningsId: prev?._id,
          result: undefined,
        });
      }
      return { ok: true, reset: true };
    }

    const rec = await recomputeInnings(ctx, target._id);
    if (rec) {
      // `remaining` is newest-first, so the ball that is now last is the first
      // element — its bowler is the one who should be at the crease. (The old
      // code picked the OLDEST ball's bowler, so after an undo the scorer was
      // shown the wrong current bowler.)
      const prev = remaining[0];
      await ctx.db.patch(target._id, { currentBowlerId: prev.bowlerId });
    }

    // If an auto-created later innings (e.g. innings 2 created when innings 1
    // finished) is now empty because we just undid the ball that completed the
    // previous innings, remove it and point the match back at the fixed innings
    // — otherwise the scorer would be prompted to set openers for innings 2
    // while innings 1 still has balls left.
    const allInnings = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .collect();
    const orphans = allInnings.filter(
      (i) =>
        i.number > target.number &&
        i.ballsBowled === 0 &&
        i.totalRuns === 0 &&
        i.wickets === 0,
    );
    for (const o of orphans) await ctx.db.delete(o._id);
    if (orphans.length > 0) {
      await ctx.db.patch(match._id, {
        status: "LIVE",
        currentInningsId: target._id,
        result: undefined,
      });
    } else if (match.status === "COMPLETED") {
      await ctx.db.patch(match._id, { status: "LIVE", result: undefined });
    }
    return { ok: true, reset: false };
  },
});
