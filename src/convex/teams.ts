import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getActiveTournament, requireAdmin } from "./helpers";

/** Teams of the active tournament (public). */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const tournament = await getActiveTournament(ctx);
    if (!tournament) return [];
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();
    return teams.sort((a, b) => a.name.localeCompare(b.name));
  },
});

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

/** Admin: create a team under a tournament (defaults to the active one). */
export const create = mutation({
  args: {
    name: v.string(),
    shortCode: v.string(),
    color: v.string(),
    tournamentId: v.optional(v.id("tournaments")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    let tournamentId = args.tournamentId;
    if (!tournamentId) {
      const active = await getActiveTournament(ctx);
      if (!active) {
        throw new Error("No active tournament — create a tournament first.");
      }
      tournamentId = active._id;
    }
    return await ctx.db.insert("teams", {
      tournamentId,
      name: args.name,
      shortCode: args.shortCode.toUpperCase().slice(0, 4),
      color: args.color,
    });
  },
});
