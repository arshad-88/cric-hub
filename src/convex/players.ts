import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrganizer } from "./helpers";
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

/** Organizer: add a player to a squad (phone autofill + styles + jersey). */
export const create = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    phone: v.optional(v.string()),
    role: playerRoleValidator,
    battingStyle: v.optional(v.string()),
    bowlingStyle: v.optional(v.string()),
    jerseyNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found.");
    await requireOrganizer(ctx, team.tournamentId);
    return await ctx.db.insert("players", {
      teamId: args.teamId,
      name: args.name,
      phone: args.phone,
      role: args.role,
      battingStyle: args.battingStyle,
      bowlingStyle: args.bowlingStyle,
      jerseyNumber: args.jerseyNumber,
    });
  },
});

/** Organizer: edit a player's details. */
export const update = mutation({
  args: {
    playerId: v.id("players"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(playerRoleValidator),
    battingStyle: v.optional(v.string()),
    bowlingStyle: v.optional(v.string()),
    jerseyNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) throw new Error("Player not found.");
    const team = await ctx.db.get(player.teamId);
    if (!team) throw new Error("Team not found.");
    await requireOrganizer(ctx, team.tournamentId);
    await ctx.db.patch(args.playerId, {
      name: args.name ?? player.name,
      phone: args.phone !== undefined ? args.phone : player.phone,
      role: args.role ?? player.role,
      battingStyle: args.battingStyle !== undefined ? args.battingStyle : player.battingStyle,
      bowlingStyle: args.bowlingStyle !== undefined ? args.bowlingStyle : player.bowlingStyle,
      jerseyNumber: args.jerseyNumber !== undefined ? args.jerseyNumber : player.jerseyNumber,
    });
    return args.playerId;
  },
});

/** Organizer: remove a player from a squad. */
export const remove = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("Player not found.");
    const team = await ctx.db.get(player.teamId);
    if (!team) throw new Error("Team not found.");
    await requireOrganizer(ctx, team.tournamentId);
    await ctx.db.delete(playerId);
    return playerId;
  },
});
