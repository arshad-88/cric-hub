// ---------------------------------------------------------------------------
// seed.ts — dev-only cleanup. There is intentionally NO demo data: the app
// ships empty and every tournament is created by its own organizer through
// the app. `reset` wipes every domain table (auth users and app settings are
// kept) so a developer can start from a clean slate:
//    bunx convex run seed:reset
// ---------------------------------------------------------------------------

import { query, mutation } from "./_generated/server";

/** Read-only row counts per domain table — handy to confirm a clean slate. */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "tournaments",
      "teams",
      "players",
      "matches",
      "innings",
      "deliveries",
      "matchEvents",
      "matchFollows",
      "pushSubscriptions",
      "auctions",
      "auctionTeams",
    ] as const;
    const out: Record<string, number> = {};
    for (const table of tables) {
      out[table] = (await ctx.db.query(table).collect()).length;
    }
    return out;
  },
});

/** Wipe every domain table (keeps auth users + settings intact). */
export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    // Order matters: children first, parents last.
    const tables = [
      "deliveries",
      "innings",
      "matches",
      "matchEvents",
      "matchFollows",
      "pushSubscriptions",
      "players",
      "teams",
      "tournaments",
      "auctionTeams",
      "auctions",
    ] as const;
    for (const table of tables) {
      const rows = await ctx.db.query(table).collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    return { ok: true };
  },
});
