import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getActiveTournament, requireAdmin } from "./helpers";

/** The active tournament (the one powering the public pages). */
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

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tournaments").order("desc").collect();
  },
});

/** Admin: create a tournament; optionally make it the active one. */
export const create = mutation({
  args: {
    name: v.string(),
    year: v.number(),
    description: v.optional(v.string()),
    makeActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
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
      active: makeActive,
    });
  },
});

/** Admin: mark a tournament as the active one. */
export const setActive = mutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    await requireAdmin(ctx);
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
