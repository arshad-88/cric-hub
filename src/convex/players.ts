import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./helpers";
import { playerRoleValidator } from "./schema";

export const listByTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    return players.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** All squads of a tournament, grouped by team (admin roster screen). */
export const listByTournament = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();
    const players = await ctx.db.query("players").collect();
    const byTeam = players.filter((p) =>
      teams.some((t) => t._id === p.teamId),
    );
    return { teams, players: byTeam };
  },
});

/** Admin: add a player to a squad. */
export const create = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    role: playerRoleValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db.insert("players", {
      teamId: args.teamId,
      name: args.name,
      role: args.role,
    });
  },
});
