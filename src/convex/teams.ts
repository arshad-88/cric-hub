import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getActiveTournament, requireOrganizer } from "./helpers";

/** Teams of the active tournament (public). */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const tournament = await getActiveTournament(ctx);
    if (!tournament) return [];
    return await listByTournamentId(ctx, tournament._id);
  },
});

/** Teams of any tournament (public) — powers the tournament pages. */
export const listByTournament = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    return await listByTournamentId(ctx, tournamentId);
  },
});

async function listByTournamentId(
  ctx: QueryCtx,
  tournamentId: Id<"tournaments">,
) {
  const teams = await ctx.db
    .query("teams")
    .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
    .collect();
  return teams.sort((a, b) => a.name.localeCompare(b.name));
}

export const get = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    return await ctx.db.get(teamId);
  },
});

/** Team page: squad + recent matches with opponent and result. */
export const getDetail = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const team = await ctx.db.get(teamId);
    if (!team) return null;
    const tournament = await ctx.db.get(team.tournamentId);
    const players = await ctx.db
      .query("players")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    const aMatches = await ctx.db
      .query("matches")
      .withIndex("by_team_a", (q) => q.eq("teamAId", teamId))
      .collect();
    const bMatches = await ctx.db
      .query("matches")
      .withIndex("by_team_b", (q) => q.eq("teamBId", teamId))
      .collect();

    const matches = [...aMatches, ...bMatches].sort(
      (a, b) => b.startTime - a.startTime,
    );
    const opponentIds = new Set<Id<"teams">>();
    for (const m of matches) {
      opponentIds.add(m.teamAId === teamId ? m.teamBId : m.teamAId);
    }
    const opponents = new Map(
      (await Promise.all([...opponentIds].map((id) => ctx.db.get(id))))
        .filter((t) => t !== null)
        .map((t) => [t!._id, t!]),
    );

    return {
      team,
      tournament,
      players: players.sort((a, b) => a.name.localeCompare(b.name)),
      matches: matches.map((m) => ({
        id: m._id,
        status: m.status,
        startTime: m.startTime,
        stage: m.stage,
        result: m.result,
        opponent: opponents.get(m.teamAId === teamId ? m.teamBId : m.teamAId) ?? null,
      })),
    };
  },
});

/** Organizer: create a team under a specific tournament. */
export const create = mutation({
  args: {
    name: v.string(),
    shortCode: v.string(),
    color: v.string(),
    logoUrl: v.optional(v.string()),
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found.");
    await requireOrganizer(ctx, args.tournamentId);
    return await ctx.db.insert("teams", {
      tournamentId: args.tournamentId,
      name: args.name,
      shortCode: args.shortCode.toUpperCase().slice(0, 4),
      color: args.color,
      logoUrl: args.logoUrl,
    });
  },
});
