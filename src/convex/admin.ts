// ---------------------------------------------------------------------------
// hub.ts — per-tournament stats for the My Hub dashboard.
// There is no global admin role: `isOrganizer` reflects whether the signed-in
// user is one of the tournament's organizers (creator + co-organizers).
// ---------------------------------------------------------------------------

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserAny } from "./helpers";

/** Hub stats for a specific tournament + organizer state of the caller. */
export const hubStats = query({
  args: { tournamentId: v.optional(v.id("tournaments")) },
  handler: async (ctx, { tournamentId }) => {
    const user = await getCurrentUserAny(ctx);
    const tournament = tournamentId ? await ctx.db.get(tournamentId) : null;

    let isOrganizer = false;
    if (tournament && user) {
      isOrganizer = (tournament.organizers ?? []).some((id) => id === user._id);
    }

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

    // Organizer identities (names + phones) — only revealed to the caller
    // when they are themselves an organizer; never to random signed-in users
    // (phone numbers are private identity handles on this platform).
    let organizers: {
      id: string;
      name: string;
      phone: string;
      isCreator: boolean;
    }[] = [];
    if (isOrganizer && tournament) {
      const organizerDocs = (
        await Promise.all(
          (tournament.organizers ?? []).map((id) => ctx.db.get(id)),
        )
      ).filter((o): o is NonNullable<typeof o> => o !== null);
      organizers = organizerDocs.map((doc, i) => ({
        id: String(doc._id),
        name: doc.name ?? "Organizer",
        phone: doc.phone ?? "",
        isCreator: i === 0,
      }));
    }

    return {
      isOrganizer,
      tournament: tournament
        ? { id: tournament._id, name: tournament.name, year: tournament.year }
        : null,
      counts,
      organizers,
    };
  },
});
