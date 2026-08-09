import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getActiveTournament,
  normalizePhone,
  requireOrganizer,
  requireUser,
} from "./helpers";
import { ballTypeValidator } from "./schema";

/** The featured tournament (powers the landing page hero). */
export const getActive = query({
  args: {},
  handler: async (ctx) => {
    return await getActiveTournament(ctx);
  },
});

export const get = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    return await ctx.db.get(tournamentId);
  },
});

type TourStatus = "ACTIVE" | "UPCOMING" | "PAST";

/** Public tournament directory — every tournament with a derived status. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("tournaments").order("desc").collect();
    const rows = [];
    for (const t of all) {
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", t._id))
        .collect();
      const matches = await ctx.db
        .query("matches")
        .withIndex("by_tournament_status", (q) =>
          q.eq("tournamentId", t._id),
        )
        .collect();
      const liveMatchId =
        matches.find((m) => m.status === "LIVE")?._id ?? null;
      const completed = matches.filter((m) => m.status === "COMPLETED").length;

      let status: TourStatus;
      if (liveMatchId) status = "ACTIVE";
      else if (t.active) status = "ACTIVE";
      else if (t.endDate != null && t.endDate < Date.now()) status = "PAST";
      else if (t.startDate != null && t.startDate > Date.now()) status = "UPCOMING";
      else status = completed > 0 ? "PAST" : "UPCOMING";

      rows.push({
        id: t._id,
        name: t.name,
        year: t.year,
        description: t.description,
        city: t.city,
        ballType: t.ballType,
        startDate: t.startDate,
        endDate: t.endDate,
        bannerUrl: t.bannerUrl,
        active: t.active,
        status,
        teamsCount: teams.length,
        matchesCount: matches.length,
        completedCount: completed,
        liveMatchId,
        organizers: (t.organizers ?? []).map((id) => String(id)),
      });
    }
    // ACTIVE first, then UPCOMING (soonest), then PAST (newest first)
    const rank = (s: TourStatus) => (s === "ACTIVE" ? 0 : s === "UPCOMING" ? 1 : 2);
    return rows.sort(
      (a, b) =>
        rank(a.status) - rank(b.status) ||
        (a.status === "UPCOMING"
          ? (a.startDate ?? 0) - (b.startDate ?? 0)
          : (b.startDate ?? 0) - (a.startDate ?? 0)),
    );
  },
});

/**
 * Create a tournament. Any signed-in user can start one — they become its
 * organizer and can add co-organizers (who then get edit + scoring access).
 */
export const create = mutation({
  args: {
    name: v.string(),
    year: v.number(),
    description: v.optional(v.string()),
    city: v.optional(v.string()),
    ballType: v.optional(ballTypeValidator),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    bannerUrl: v.optional(v.string()),
    defaultOvers: v.optional(v.number()),
    makeActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const makeActive = args.makeActive ?? false;
    if (makeActive) {
      const current = await ctx.db
        .query("tournaments")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect();
      for (const t of current) {
        await ctx.db.patch(t._id, { active: false });
      }
    }
    return await ctx.db.insert("tournaments", {
      name: args.name,
      year: args.year,
      description: args.description,
      city: args.city,
      ballType: args.ballType,
      startDate: args.startDate,
      endDate: args.endDate,
      bannerUrl: args.bannerUrl,
      defaultOvers: args.defaultOvers,
      active: makeActive,
      organizers: [user._id],
    });
  },
});

/** Organizer-only: mark a tournament as the featured one. */
export const setActive = mutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    await requireOrganizer(ctx, tournamentId);
    const current = await ctx.db
      .query("tournaments")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    for (const t of current) {
      await ctx.db.patch(t._id, { active: false });
    }
    await ctx.db.patch(tournamentId, { active: true });
    return tournamentId;
  },
});

/**
 * Organizer-only: grant a co-organizer (by phone number) edit + scoring
 * access to the tournament. The number must belong to a registered user.
 */
export const addOrganizer = mutation({
  args: { tournamentId: v.id("tournaments"), phone: v.string() },
  handler: async (ctx, { tournamentId, phone }) => {
    const { tournament } = await requireOrganizer(ctx, tournamentId);
    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error("Enter a valid phone number.");
    const target = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", normalized))
      .first();
    if (!target) {
      throw new Error(
        `No account found for ${phone} — ask them to sign in with that number first.`,
      );
    }
    if (!tournament.organizers.some((id) => id === target._id)) {
      await ctx.db.patch(tournamentId, {
        organizers: [...tournament.organizers, target._id],
      });
    }
    return target._id;
  },
});

/** Organizer-only: revoke a co-organizer. The creator (first entry) is fixed. */
export const removeOrganizer = mutation({
  args: { tournamentId: v.id("tournaments"), userId: v.id("users") },
  handler: async (ctx, { tournamentId, userId }) => {
    const { tournament } = await requireOrganizer(ctx, tournamentId);
    if (tournament.organizers[0] === userId) {
      throw new Error("The tournament creator cannot be removed.");
    }
    if (tournament.organizers.some((id) => id === userId)) {
      await ctx.db.patch(tournamentId, {
        organizers: tournament.organizers.filter((id) => id !== userId),
      });
    }
    return tournamentId;
  },
});
