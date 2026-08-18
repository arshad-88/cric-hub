// ---------------------------------------------------------------------------
// scoring.ts — interactive scorer mutations (Role B: Admin / Ground Scorer).
// Every ball recorded here instantly propagates to public viewers through
// Convex's reactive query subscriptions.
// ---------------------------------------------------------------------------

import { internalMutation, mutation } from "./_generated/server";
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
  formatOvers,
} from "./cricket";
import type { DeliveryLike } from "./cricket";
import { EXTRA_TYPE, WICKET_TYPE, extraTypeValidator, wicketTypeValidator } from "./schema";
import type { ExtraType, WicketType } from "./schema";
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

// ---------------------------------------------------------------------------
// Shared arg validators + cores — the public mutations add the organizer
// gate, and the `*Internal` variants (used by the tournament simulator) run
// the exact same ball-by-ball engine without it. One source of truth.
// ---------------------------------------------------------------------------

const startInningsArgs = {
  matchId: v.id("matches"),
  battingTeamId: v.id("teams"),
  bowlingTeamId: v.id("teams"),
  strikerId: v.id("players"),
  nonStrikerId: v.id("players"),
  bowlerId: v.id("players"),
};
type StartInningsArgs = {
  matchId: Id<"matches">;
  battingTeamId: Id<"teams">;
  bowlingTeamId: Id<"teams">;
  strikerId: Id<"players">;
  nonStrikerId: Id<"players">;
  bowlerId: Id<"players">;
};

const setOpenersAndBowlerArgs = {
  inningsId: v.id("innings"),
  strikerId: v.id("players"),
  nonStrikerId: v.id("players"),
  bowlerId: v.id("players"),
};
type SetOpenersAndBowlerArgs = {
  inningsId: Id<"innings">;
  strikerId: Id<"players">;
  nonStrikerId: Id<"players">;
  bowlerId: Id<"players">;
};

const setBowlerArgs = { inningsId: v.id("innings"), bowlerId: v.id("players") };
type SetBowlerArgs = { inningsId: Id<"innings">; bowlerId: Id<"players"> };

const recordDeliveryArgs = {
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
  shotRegion: v.optional(v.string()),
  shotType: v.optional(v.string()),
};
type RecordDeliveryArgs = {
  matchId: Id<"matches">;
  inningsId: Id<"innings">;
  bowlerId: Id<"players">;
  batsmanId: Id<"players">;
  nonStrikerId?: Id<"players">;
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
};

const undoLastDeliveryArgs = {
  matchId: v.id("matches"),
  inningsId: v.id("innings"),
};
type UndoLastDeliveryArgs = {
  matchId: Id<"matches">;
  inningsId: Id<"innings">;
};

/**
 * Start a fresh innings: innings 1 on an UPCOMING match, or innings 2 once
 * innings 1 is complete. Scorer supplies the opening pair and first bowler.
 */
async function startInningsCore(ctx: MutationCtx, args: StartInningsArgs) {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");
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
}

export const startInnings = mutation({
  args: startInningsArgs,
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    return await startInningsCore(ctx, args);
  },
});

/** System-internal variant used by the tournament simulator (no auth gate). */
export const startInningsInternal = internalMutation({
  args: startInningsArgs,
  handler: async (ctx, args) => startInningsCore(ctx, args),
});

/** Set/repair the crease state on a fresh innings (used when innings 2 opens). */
async function setOpenersAndBowlerCore(
  ctx: MutationCtx,
  args: SetOpenersAndBowlerArgs,
) {
    const inn = await ctx.db.get(args.inningsId);
    if (!inn) throw new Error("Innings not found");
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
}

export const setOpenersAndBowler = mutation({
  args: setOpenersAndBowlerArgs,
  handler: async (ctx, args) => {
    const inn = await ctx.db.get(args.inningsId);
    if (!inn) throw new Error("Innings not found");
    const matchForGate = await ctx.db.get(inn.matchId);
    if (!matchForGate) throw new Error("Match not found");
    await requireOrganizer(ctx, matchForGate.tournamentId);
    return await setOpenersAndBowlerCore(ctx, args);
  },
});

/** System-internal variant used by the tournament simulator (no auth gate). */
export const setOpenersAndBowlerInternal = internalMutation({
  args: setOpenersAndBowlerArgs,
  handler: async (ctx, args) => setOpenersAndBowlerCore(ctx, args),
});

/** Change the bowler (start of a new over). */
async function setBowlerCore(ctx: MutationCtx, args: SetBowlerArgs) {
    const { inningsId, bowlerId } = args;
    const inn = await ctx.db.get(inningsId);
    if (!inn) throw new Error("Innings not found");
    await assertPlayerInTeam(ctx, bowlerId, inn.bowlingTeamId, "Bowler");

    // Real-cricket rule: a bowler who bowled the previous over cannot bowl the
    // immediate next over. If the last ball is ball 1 of a new over, the scorer
    // is starting a new over and we enforce the rule. Otherwise (mid-over
    // correction), allow it.
    const deliveries = await getDeliveries(ctx, inningsId);
    if (deliveries.length > 0) {
      const lastLegal = [...deliveries].reverse().find((d) => isLegalBall(d.extraType));
      if (lastLegal && lastLegal.ballNumber === 1 && lastLegal.bowlerId === bowlerId) {
        // The last legal ball was ball 1 of a new over, meaning the scorer is
        // starting a new over. Reject if the previous over's bowler matches.
        const prevOverRows = deliveries.filter((d) => d.overNumber === lastLegal.overNumber - 1);
        if (prevOverRows.length > 0) {
          const prevBowler = prevOverRows[prevOverRows.length - 1].bowlerId;
          if (prevBowler === bowlerId) {
            throw new Error(
              "That bowler bowled the previous over — a bowler can't bowl two in a row.",
            );
          }
        }
      }
    }

    await ctx.db.patch(inningsId, { currentBowlerId: bowlerId });
    return inningsId;
}

export const setBowler = mutation({
  args: setBowlerArgs,
  handler: async (ctx, args) => {
    const inn = await ctx.db.get(args.inningsId);
    if (!inn) throw new Error("Innings not found");
    const matchForGate = await ctx.db.get(inn.matchId);
    if (!matchForGate) throw new Error("Match not found");
    await requireOrganizer(ctx, matchForGate.tournamentId);
    return await setBowlerCore(ctx, args);
  },
});

/** System-internal variant used by the tournament simulator (no auth gate). */
export const setBowlerInternal = internalMutation({
  args: setBowlerArgs,
  handler: async (ctx, args) => setBowlerCore(ctx, args),
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
async function recordDeliveryCore(ctx: MutationCtx, args: RecordDeliveryArgs) {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");
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
      // A wide is at least 1 penalty run. Runs scored by the batter on a wide
      // are not credited to the batter — they are all extras. The extraRuns
      // field holds the TOTAL extras (1 penalty + any additional running).
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
      // Retired-out ends the innings the same as a regular dismissal. For
      // retired-hurt the batter may return, but a replacement still comes in.
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
      shotType: args.shotType,
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
}

export const recordDelivery = mutation({
  args: recordDeliveryArgs,
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    return await recordDeliveryCore(ctx, args);
  },
});

/** System-internal variant used by the tournament simulator (no auth gate). */
export const recordDeliveryInternal = internalMutation({
  args: recordDeliveryArgs,
  handler: async (ctx, args) => recordDeliveryCore(ctx, args),
});

/**
 * Undo the last ball of the innings — full state rollback via recompute.
 * If the requested innings is empty (e.g. innings 2 was auto-created after
 * innings 1 finished and nothing has been bowled in it yet), it falls back
 * to the most recent innings that actually has balls so the scorer can fix
 * an error made on the final ball of the previous innings.
 */
async function undoLastDeliveryCore(
  ctx: MutationCtx,
  args: UndoLastDeliveryArgs,
) {
    const { matchId, inningsId } = args;
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
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
}

export const undoLastDelivery = mutation({
  args: undoLastDeliveryArgs,
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    return await undoLastDeliveryCore(ctx, args);
  },
});

/** System-internal variant used by the tournament simulator (no auth gate). */
export const undoLastDeliveryInternal = internalMutation({
  args: undoLastDeliveryArgs,
  handler: async (ctx, args) => undoLastDeliveryCore(ctx, args),
});

// ---------------------------------------------------------------------------
// Match control — manual innings termination, concession/withdrawal, retired hurt return
// ---------------------------------------------------------------------------

/**
 * End an innings early when play cannot continue (weather, ground conditions,
 * technical issues, etc.). The scorer provides a reason. If innings 1 ends
 * this way, the match result depends on whether innings 2 has started: if not,
 * the match is abandoned/completed without result. If innings 2 is in progress,
 * DLS or the current state determines the result.
 */
export const endInningsEarly = mutation({
  args: {
    matchId: v.id("matches"),
    inningsId: v.id("innings"),
    reason: v.string(),
  },
  handler: async (ctx, { matchId, inningsId, reason }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    if (match.status !== "LIVE") throw new Error("The match is not live.");
    const inn = await ctx.db.get(inningsId);
    if (!inn || inn.matchId !== match._id) {
      throw new Error("Innings does not belong to this match.");
    }

    const deliveries = await getDeliveries(ctx, inningsId);
    const totalRuns = deliveries.reduce((s, d) => s + d.totalRuns, 0);
    const wickets = deliveries.filter((d) => d.isWicket).length;
    const ballsBowled = deliveries.filter((d) => isLegalBall(d.extraType)).length;

    // Update the innings with final stats
    await ctx.db.patch(inningsId, { totalRuns, wickets, ballsBowled });

    if (inn.number === 1) {
      // Innings 1 ended early — no innings 2 has started yet
      // Mark the match as completed with no result (abandoned)
      const btName = (await ctx.db.get(inn.battingTeamId))?.name ?? "?";
      const bwName = (await ctx.db.get(inn.bowlingTeamId))?.name ?? "?";
      const resultText = `Innings 1 ended early (${reason}). ${btName} ${totalRuns}/${wickets} in ${formatOvers(ballsBowled)} overs. No result.`;
      await ctx.db.patch(matchId, {
        status: "COMPLETED",
        result: resultText,
        currentInningsId: inningsId,
      });
      await ctx.runMutation(internal.notifications.recordEvent, {
        matchId,
        type: "result",
        title: "INNINGS ENDED EARLY",
        message: resultText,
        inningsNumber: 1,
      });
      return { ok: true, result: resultText };
    }

    if (inn.number === 2) {
      // Innings 2 ended early — compute result based on DLS or current state
      const in1 = deliveries.length > 0 ? await getFirstInnings(ctx, matchId) : null;
      let resultText: string;
      if (in1 && totalRuns >= (in1.totalRuns + 1)) {
        const wktsLeft = 10 - wickets;
        resultText = `${(await ctx.db.get(inn.battingTeamId))?.name ?? "?"} won by ${wktsLeft} wicket${wktsLeft === 1 ? "" : "s"} (innings ended early: ${reason}).`;
      } else if (in1 && totalRuns === in1.totalRuns) {
        resultText = `Match tied (innings ended early: ${reason}). Both teams receive 1 point.`;
      } else {
        const battingName = (await ctx.db.get(inn.battingTeamId))?.name ?? "?";
        const bowlingName = (await ctx.db.get(inn.bowlingTeamId))?.name ?? "?";
        const margin = in1 ? in1.totalRuns - totalRuns : 0;
        resultText = `${bowlingName} won by ${margin} run${margin === 1 ? "" : "s"} (innings ended early: ${reason}).`;
      }
      await ctx.db.patch(matchId, {
        status: "COMPLETED",
        result: resultText,
        currentInningsId: inningsId,
      });
      await ctx.runMutation(internal.notifications.recordEvent, {
        matchId,
        type: "result",
        title: "MATCH ENDED EARLY",
        message: resultText,
        inningsNumber: 2,
      });
      return { ok: true, result: resultText };
    }

    throw new Error("Cannot end a super over innings early.");
  },
});

async function getFirstInnings(
  ctx: MutationCtx,
  matchId: Id<"matches">,
): Promise<{ totalRuns: number; wickets: number; ballsBowled: number } | null> {
  const rows = await ctx.db
    .query("innings")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .collect();
  const in1 = rows.find((i) => i.number === 1);
  return in1
    ? { totalRuns: in1.totalRuns, wickets: in1.wickets, ballsBowled: in1.ballsBowled }
    : null;
}

/**
 * End the match due to opponent withdrawal / concession. The winning team is
 * recorded and the result reflects the concession.
 */
export const endMatchConceded = mutation({
  args: {
    matchId: v.id("matches"),
    concedingTeamId: v.id("teams"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { matchId, concedingTeamId, reason }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    if (match.status !== "LIVE" && match.status !== "UPCOMING") {
      throw new Error("Match is not in a state that can be conceded.");
    }
    if (match.teamAId === concedingTeamId && match.teamBId === concedingTeamId) {
      throw new Error("Invalid team.");
    }
    const winnerTeamId =
      concedingTeamId === match.teamAId ? match.teamBId : match.teamAId;
    const loserName = (await ctx.db.get(concedingTeamId))?.name ?? "?";
    const winnerName = (await ctx.db.get(winnerTeamId))?.name ?? "?";
    const reasonText = reason ? ` (${reason})` : "";
    const resultText = `[CONCEDED] ${winnerName} won by ${loserName} conceding/withdrawing${reasonText}.`;
    await ctx.db.patch(matchId, {
      status: "COMPLETED",
      result: resultText,
    });
    await ctx.runMutation(internal.notifications.recordEvent, {
      matchId,
      type: "result",
      title: "MATCH CONCEDED",
      message: resultText,
    });
    return { ok: true, result: resultText, winnerTeamId };
  },
});

/**
 * Return a retired-hurt batter to the crease. The scorer picks which end they
 * take (striker or non-striker). Only batters with a "Retired hurt" dismissal
 * in the deliveries table may be returned.
 */
export const returnRetiredHurtBatter = mutation({
  args: {
    matchId: v.id("matches"),
    inningsId: v.id("innings"),
    playerId: v.id("players"),
    asStriker: v.boolean(),
  },
  handler: async (ctx, { matchId, inningsId, playerId, asStriker }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    const inn = await ctx.db.get(inningsId);
    if (!inn || inn.matchId !== match._id) {
      throw new Error("Innings does not belong to this match.");
    }
    if (inn.isSuperOver) throw new Error("Cannot return a batter in a Super Over.");

    // Verify this player was retired hurt in this innings
    const deliveries = await getDeliveries(ctx, inningsId);
    const retiredHurtDelivery = deliveries.find(
      (d) => d.dismissedBatterId === playerId && d.wicketType === WICKET_TYPE.RETIRED_HURT,
    );
    if (!retiredHurtDelivery) {
      throw new Error("This player was not retired hurt in this innings.");
    }

    // Verify the player isn't currently at the crease
    if (inn.strikerId === playerId || inn.nonStrikerId === playerId) {
      throw new Error("This player is already at the crease.");
    }

    // Verify they are on the batting side
    await assertPlayerInTeam(ctx, playerId, inn.battingTeamId, "Player");

    // Place them at the requested end
    if (asStriker) {
      await ctx.db.patch(inningsId, { strikerId: playerId });
    } else {
      await ctx.db.patch(inningsId, { nonStrikerId: playerId });
    }

    return { ok: true };
  },
});

/**
 * Set a DLS-revised target for the chasing innings. Used when rain or other
 * interruptions reduce the match. The scorer enters the revised target, and
 * the innings ends when that target is reached.
 */
export const setDLSTarget = mutation({
  args: {
    matchId: v.id("matches"),
    inningsId: v.id("innings"),
    revisedTarget: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { matchId, inningsId, revisedTarget, reason }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    const inn = await ctx.db.get(inningsId);
    if (!inn || inn.matchId !== match._id) {
      throw new Error("Innings does not belong to this match.");
    }
    if (inn.number !== 2 && inn.number !== 4) {
      throw new Error("DLS target only applies to chasing innings.");
    }
    if (revisedTarget < 1) throw new Error("Target must be at least 1.");

    await ctx.db.patch(inningsId, { target: revisedTarget });

    const btName = (await ctx.db.get(inn.battingTeamId))?.name ?? "?";
    const bwName = (await ctx.db.get(inn.bowlingTeamId))?.name ?? "?";
    const resultText = reason
      ? `DLS revised target: ${btName} need ${revisedTarget} to win (${reason}).`
      : `DLS revised target: ${btName} need ${revisedTarget} to win.`;
    await ctx.runMutation(internal.notifications.recordEvent, {
      matchId,
      type: "innings",
      title: "DLS TARGET SET",
      message: resultText,
      inningsNumber: inn.number,
    });
    return { ok: true, target: revisedTarget };
  },
});

// ---------------------------------------------------------------------------
// Undo mutations for match controls
// ---------------------------------------------------------------------------

/**
 * Undo a match that was ended early or conceded — revert from COMPLETED
 * back to LIVE with no result.
 */
export const undoMatchEnd = mutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    if (match.status !== "COMPLETED") throw new Error("Match is not completed.");
    await ctx.db.patch(matchId, {
      status: "LIVE",
      result: undefined,
    });
    return { ok: true };
  },
});

/**
 * Undo a DLS target override — restore the target to the first innings
 * total + 1 (the standard chasing target).
 */
export const undoDLSTarget = mutation({
  args: { matchId: v.id("matches"), inningsId: v.id("innings") },
  handler: async (ctx, { matchId, inningsId }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    const inn = await ctx.db.get(inningsId);
    if (!inn || inn.matchId !== match._id) throw new Error("Innings does not belong to this match.");
    if (inn.number !== 2 && inn.number !== 4) throw new Error("DLS target only applies to chasing innings.");
    // Restore target to first innings total + 1
    const firstInn = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const in1 = firstInn.find((i) => i.number === 1);
    if (!in1) throw new Error("First innings not found.");
    const originalTarget = in1.totalRuns + 1;
    await ctx.db.patch(inningsId, { target: originalTarget });
    return { ok: true, target: originalTarget };
  },
});

/**
 * Undo a returned retired-hurt batter — remove them from the crease.
 * The scorer must then pick a replacement or end the innings.
 */
export const undoReturnBatter = mutation({
  args: {
    matchId: v.id("matches"),
    inningsId: v.id("innings"),
    playerId: v.id("players"),
  },
  handler: async (ctx, { matchId, inningsId, playerId }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    await requireOrganizer(ctx, match.tournamentId);
    const inn = await ctx.db.get(inningsId);
    if (!inn || inn.matchId !== match._id) throw new Error("Innings does not belong to this match.");
    // Remove from whichever end they're at
    if (inn.strikerId === playerId) {
      await ctx.db.patch(inningsId, { strikerId: undefined });
    } else if (inn.nonStrikerId === playerId) {
      await ctx.db.patch(inningsId, { nonStrikerId: undefined });
    } else {
      throw new Error("This player is not currently at the crease.");
    }
    return { ok: true };
  },
});
