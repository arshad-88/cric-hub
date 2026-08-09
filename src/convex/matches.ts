import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getActiveTournament, requireOrganizer } from "./helpers";
import {
  matchStageValidator,
  matchStatusValidator,
  tossDecisionValidator,
} from "./schema";

interface TeamLite {
  _id: string;
  name: string;
  shortCode: string;
  color: string;
}

/** Schedule/fixtures feed — lightweight rows with team identity. */
export const list = query({
  args: {
    status: v.optional(matchStatusValidator),
    tournamentId: v.optional(v.id("tournaments")),
  },
  handler: async (ctx, { status, tournamentId }) => {
    let tournamentIdResolved = tournamentId;
    if (!tournamentIdResolved) {
      const active = await getActiveTournament(ctx);
      if (!active) return [];
      tournamentIdResolved = active._id;
    }

    const rows = await ctx.db
      .query("matches")
      .withIndex("by_tournament_status", (q) =>
        q.eq("tournamentId", tournamentIdResolved),
      )
      .collect();
    const filtered = status ? rows.filter((m) => m.status === status) : rows;

    const teamIds = new Set<Id<"teams">>();
    for (const m of filtered) {
      teamIds.add(m.teamAId);
      teamIds.add(m.teamBId);
    }
    const teamDocs = await Promise.all([...teamIds].map((id) => ctx.db.get(id)));
    const teamMap = new Map(
      teamDocs
        .filter((t): t is NonNullable<typeof t> => t !== null)
        .map((t) => [t._id, t]),
    );

    const asLite = (id: Id<"teams">): TeamLite | null => {
      const t = teamMap.get(id);
      if (!t) return null;
      return { _id: t._id, name: t.name, shortCode: t.shortCode, color: t.color };
    };

    const sorted = [...filtered].sort((a, b) => {
      // LIVE first, then by start time (soonest upcoming first, newest completed first)
      const rank = (m: { status: string }) =>
        m.status === "LIVE" ? 0 : m.status === "UPCOMING" ? 1 : 2;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.status === "UPCOMING") return a.startTime - b.startTime;
      return b.startTime - a.startTime;
    });

    // compact innings summary for cards (runs / wickets / overs per innings)
    const inningsSummary = new Map<string, string>();
    for (const m of filtered) {
      const innings = await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .collect();
      innings.sort((a, b) => a.number - b.number);
      if (innings.length === 0) continue;
      const label = innings
        .map((i) => {
          const completed = Math.floor(i.ballsBowled / 6);
          const rem = i.ballsBowled % 6;
          return `${i.totalRuns}/${i.wickets} (${completed}.${rem})`;
        })
        .join(" · ");
      inningsSummary.set(m._id, label);
    }

    return sorted.map((m) => ({
      id: m._id,
      tournamentId: m.tournamentId,
      status: m.status,
      overs: m.overs,
      venue: m.venue,
      stage: m.stage,
      startTime: m.startTime,
      streamUrl: m.streamUrl,
      result: m.result,
      inningsSummary: inningsSummary.get(m._id) ?? null,
      teamA: asLite(m.teamAId),
      teamB: asLite(m.teamBId),
    }));
  },
});

/** Organizer: create a fixture. */
export const create = mutation({
  args: {
    teamAId: v.id("teams"),
    teamBId: v.id("teams"),
    overs: v.number(),
    venue: v.optional(v.string()),
    stage: v.optional(matchStageValidator),
    startTime: v.number(),
    streamUrl: v.optional(v.string()),
    tournamentId: v.optional(v.id("tournaments")),
  },
  handler: async (ctx, args) => {
    if (args.teamAId === args.teamBId) {
      throw new Error("A team cannot play itself.");
    }
    let tournamentId = args.tournamentId;
    if (!tournamentId) {
      const active = await getActiveTournament(ctx);
      if (!active) throw new Error("Select a tournament first.");
      tournamentId = active._id;
    }
    await requireOrganizer(ctx, tournamentId);
    const [teamA, teamB] = await Promise.all([
      ctx.db.get(args.teamAId),
      ctx.db.get(args.teamBId),
    ]);
    if (!teamA || !teamB) throw new Error("Team not found.");
    if (teamA.tournamentId !== tournamentId || teamB.tournamentId !== tournamentId) {
      throw new Error("Teams must belong to the same tournament.");
    }
    return await ctx.db.insert("matches", {
      tournamentId,
      teamAId: args.teamAId,
      teamBId: args.teamBId,
      status: "UPCOMING",
      tossWinnerId: undefined,
      tossDecision: undefined,
      overs: args.overs,
      venue: args.venue,
      stage: args.stage,
      startTime: args.startTime,
      streamUrl: args.streamUrl,
      currentInningsId: undefined,
      result: undefined,
    });
  },
});

/** Organizer: paste/update the YouTube or Twitch stream URL at any point. */
export const updateStreamUrl = mutation({
  args: { matchId: v.id("matches"), streamUrl: v.string() },
  handler: async (ctx, { matchId, streamUrl }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found.");
    await requireOrganizer(ctx, match.tournamentId);
    await ctx.db.patch(matchId, { streamUrl: streamUrl || undefined });
    return matchId;
  },
});

export const setToss = mutation({
  args: {
    matchId: v.id("matches"),
    tossWinnerId: v.id("teams"),
    tossDecision: tossDecisionValidator,
  },
  handler: async (ctx, { matchId, tossWinnerId, tossDecision }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found.");
    await requireOrganizer(ctx, match.tournamentId);
    await ctx.db.patch(matchId, { tossWinnerId, tossDecision });
    return matchId;
  },
});

/** Organizer: manually flip a match's status (e.g. abandon a fixture). */
export const setStatus = mutation({
  args: { matchId: v.id("matches"), status: matchStatusValidator },
  handler: async (ctx, { matchId, status }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found.");
    await requireOrganizer(ctx, match.tournamentId);
    await ctx.db.patch(matchId, { status });
    return matchId;
  },
});
