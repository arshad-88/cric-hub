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

/** Organizer: fix mistyped fixture details (overs, venue, stage, time, stream). */
export const update = mutation({
  args: {
    matchId: v.id("matches"),
    overs: v.optional(v.number()),
    venue: v.optional(v.string()),
    stage: v.optional(matchStageValidator),
    startTime: v.optional(v.number()),
    streamUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found.");
    await requireOrganizer(ctx, match.tournamentId);
    await ctx.db.patch(args.matchId, {
      overs: args.overs ?? match.overs,
      venue: args.venue !== undefined ? args.venue : match.venue,
      stage: args.stage !== undefined ? args.stage : match.stage,
      startTime: args.startTime ?? match.startTime,
      streamUrl: args.streamUrl !== undefined ? args.streamUrl : match.streamUrl,
    });
    return args.matchId;
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

/** Organizer: undo a completed toss (before the first ball) and redo it.
 *  Clears the saved XIs too, so the whole ceremony restarts cleanly. */
export const undoToss = mutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found.");
    await requireOrganizer(ctx, match.tournamentId);
    const innings = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    if (innings.length > 0) {
      throw new Error("The match has started — the toss can no longer be undone.");
    }
    await ctx.db.patch(matchId, {
      tossWinnerId: undefined,
      tossDecision: undefined,
      teamAXI: undefined,
      teamBXI: undefined,
    });
    return matchId;
  },
});

/** Organizer: lock in the playing XI (exactly 11) for both teams after the
 *  toss. The XI is what the scorer picks openers/bowlers/wicket replacements
 *  from, and it's shown on the public match center. Also mirrors the picks
 *  onto each player's isPlayingXI flag so team pages / profiles stay in sync. */
export const setPlayingXI = mutation({
  args: {
    matchId: v.id("matches"),
    teamAXI: v.array(v.id("players")),
    teamBXI: v.array(v.id("players")),
  },
  handler: async (ctx, { matchId, teamAXI, teamBXI }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found.");
    await requireOrganizer(ctx, match.tournamentId);
    if (teamAXI.length !== 11 || teamBXI.length !== 11) {
      throw new Error("Pick exactly 11 players for each team.");
    }
    const check = async (ids: Id<"players">[], teamId: Id<"teams">) => {
      for (const id of ids) {
        const p = await ctx.db.get(id);
        if (!p) throw new Error("A selected player no longer exists.");
        if (p.teamId !== teamId) {
          throw new Error(`${p.name} is not in this team's squad.`);
        }
      }
    };
    await check(teamAXI, match.teamAId);
    await check(teamBXI, match.teamBId);

    const squad = async (teamId: Id<"teams">) =>
      ctx.db
        .query("players")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect();
    const [aAll, bAll] = await Promise.all([squad(match.teamAId), squad(match.teamBId)]);
    const aSet = new Set(teamAXI.map((id) => String(id)));
    const bSet = new Set(teamBXI.map((id) => String(id)));
    for (const p of aAll) {
      const inXI = aSet.has(String(p._id));
      if (Boolean(p.isPlayingXI) !== inXI) await ctx.db.patch(p._id, { isPlayingXI: inXI });
    }
    for (const p of bAll) {
      const inXI = bSet.has(String(p._id));
      if (Boolean(p.isPlayingXI) !== inXI) await ctx.db.patch(p._id, { isPlayingXI: inXI });
    }

    await ctx.db.patch(matchId, { teamAXI, teamBXI });
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
