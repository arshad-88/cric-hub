// ---------------------------------------------------------------------------
// admin.ts — admin bootstrap + dashboard stats.
// Bootstrap rule: the FIRST authenticated user can claim the admin role while
// zero admins exist (a village league has one ground scorer / league admin).
// ---------------------------------------------------------------------------

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserAny } from "./helpers";
import { ROLES } from "./schema";

export const grantAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserAny(ctx);
    if (!user) throw new Error("Sign in first — then claim the scorer role.");
    const admins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), ROLES.ADMIN))
      .collect();
    if (admins.length > 0 && user.role !== ROLES.ADMIN) {
      throw new Error("An admin already exists — ask them to promote you.");
    }
    await ctx.db.patch(user._id, { role: ROLES.ADMIN });
    return { ok: true };
  },
});

export const hasAnyAdmin = query({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), ROLES.ADMIN))
      .collect();
    return admins.length > 0;
  },
});

/** Admin hub stats for a specific tournament + auth state. */
export const adminStats = query({
  args: { tournamentId: v.optional(v.id("tournaments")) },
  handler: async (ctx, { tournamentId }) => {
    const user = await getCurrentUserAny(ctx);
    const isAdmin = user?.role === ROLES.ADMIN;
    const tournament = tournamentId
      ? await ctx.db.get(tournamentId)
      : await ctx.db
          .query("tournaments")
          .withIndex("by_active", (q) => q.eq("active", true))
          .first();

    let counts = { teams: 0, players: 0, upcoming: 0, live: 0, completed: 0 };
    if (tournament) {
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect();
      const allPlayers = await ctx.db.query("players").collect();
      const teamIds = new Set(teams.map((t) => t._id));
      const matches = await ctx.db
        .query("matches")
        .withIndex("by_tournament_status", (q) =>
          q.eq("tournamentId", tournament._id),
        )
        .collect();
      counts = {
        teams: teams.length,
        players: allPlayers.filter((p) => teamIds.has(p.teamId)).length,
        upcoming: matches.filter((m) => m.status === "UPCOMING").length,
        live: matches.filter((m) => m.status === "LIVE").length,
        completed: matches.filter((m) => m.status === "COMPLETED").length,
      };
    }

    const admins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), ROLES.ADMIN))
      .collect();

    return {
      isAdmin,
      tournament: tournament
        ? { id: tournament._id, name: tournament.name, year: tournament.year }
        : null,
      counts,
      hasAnyAdmin: admins.length > 0,
    };
  },
});
