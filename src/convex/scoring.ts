// ---------------------------------------------------------------------------
// scoring.ts — interactive scorer mutations (Role B: Admin / Ground Scorer).
// Every ball recorded here instantly propagates to public viewers through
// Convex's reactive query subscriptions.
// ---------------------------------------------------------------------------

import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireOrganizer } from "./helpers";
import {
  buildCommentary,
  computeMatchResult,
  isInningsComplete,
  isLegalBall,
  replayCrease,
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

    let inningsNumber: number;
    if (existing.length === 0) {
      inningsNumber = 1;
    } else if (existing.length === 1) {
      const first = existing[0];
      if (first.number !== 1 || !isInningsComplete(first.wickets, first.ballsBowled, match.overs)) {
        throw new Error("The current innings is still in progress.");
      }
      if (args.battingTeamId !== first.bowlingTeamId) {
        throw new Error("The chasing team must be the side that bowled first.");
      }
      inningsNumber = 2;
    } else {
      throw new Error("This match already has two innings.");
    }

    await assertPlayerInTeam(ctx, args.strikerId, args.battingTeamId, "Striker");
    await assertPlayerInTeam(ctx, args.nonStrikerId, args.battingTeamId, "Non-striker");
    await assertPlayerInTeam(ctx, args.bowlerId, args.bowlingTeamId, "Bowler");
    if (args.strikerId === args.nonStrikerId) {
      throw new Error("Striker and non-striker must be different players.");
    }

    const inningsId = await ctx.db.insert("innings", {
      matchId: match._id,
      number: inningsNumber,
      battingTeamId: args.battingTeamId,
      bowlingTeamId: args.bowlingTeamId,
      totalRuns: 0,
      wickets: 0,
      ballsBowled: 0,
      target: inningsNumber === 2 ? existing[0].totalRuns + 1 : undefined,
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
    if (isInningsComplete(wktsSoFar, inn.ballsBowled, match.overs)) {
      throw new Error("This innings is already complete.");
    }
    if (inn.number === 2 && inn.target != null && inn.totalRuns >= inn.target) {
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
    const commentary = buildCommentary(
      {
        ...args,
        overNumber,
        ballNumber,
        totalRuns,
        isWicket: args.isWicket,
      },
      {
        bowler: bowlerDoc?.name ?? "?",
        batsman: batsmanDoc?.name ?? "?",
        dismissed: dismissedDoc?.name,
        fielder: fielderDoc?.name,
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
      commentary,
    });

    const rec = await recomputeInnings(ctx, inn._id);
    if (!rec) throw new Error("Innings disappeared.");
    const { totalRuns: runsNow, wickets: wktsNow, ballsBowled: ballsNow } = rec.inn;

    // ---- innings / match completion ----------------------------------------
    const chaseComplete =
      inn.number === 2 && inn.target != null && runsNow >= inn.target;
    const complete = chaseComplete || isInningsComplete(wktsNow, ballsNow, match.overs);

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
        return { ok: true, inningsComplete: true, nextInningsId: innings2Id };
      }

      // innings 2 done → match complete
      const all = await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .collect();
      const in1 = all.find((i) => i.number === 1);
      const in2 = all.find((i) => i.number === 2);
      let result: string | null = null;
      if (in1 && in2) {
        const [bat1, bat2] = await Promise.all([
          ctx.db.get(in1.battingTeamId),
          ctx.db.get(in2.battingTeamId),
        ]);
        result = computeMatchResult(
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
      }
      await ctx.db.patch(match._id, {
        status: "COMPLETED",
        result: result ?? undefined,
        currentInningsId: inn._id,
      });
      return { ok: true, inningsComplete: true, matchComplete: true, result };
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
          if (target.number === 2) {
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
        const in1 = all.find((i) => i.number === 1);
        await ctx.db.delete(target._id);
        await ctx.db.patch(match._id, {
          status: "LIVE",
          currentInningsId: in1?._id,
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
