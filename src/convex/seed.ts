// ---------------------------------------------------------------------------
// seed.ts — dev-only cleanup. There is intentionally NO demo data: the app
// ships empty and every tournament is created by its own organizer through
// the app. `reset` wipes the domain tables (auth users are kept) so a
// developer can start from a clean slate:
//    bunx convex run seed:reset
// ---------------------------------------------------------------------------

import { mutation } from "./_generated/server";

/** Wipe every domain table (keeps auth users intact). */
export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    for (const table of [
      "deliveries",
      "innings",
      "matches",
      "players",
      "teams",
      "tournaments",
    ] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    return { ok: true };
  },
});
