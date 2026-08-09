// ---------------------------------------------------------------------------
// helpers.ts — shared Convex-side helpers (auth gating + active tournament)
// ---------------------------------------------------------------------------

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { ROLES } from "./schema";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type Ctx = QueryCtx | MutationCtx;

/** Current signed-in user document, or null. */
export const getCurrentUserAny = async (ctx: Ctx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get(userId);
};

/** Throws unless the caller is an authenticated admin (Role B: scorer/admin). */
export const requireAdmin = async (ctx: Ctx) => {
  const user = await getCurrentUserAny(ctx);
  if (!user || user.role !== ROLES.ADMIN) {
    throw new ConvexError("Admin access required — sign in with a scorer account.");
  }
  return user;
};

/** The single tournament that powers the public pages. */
export const getActiveTournament = async (ctx: Ctx) => {
  return await ctx.db
    .query("tournaments")
    .withIndex("by_active", (q) => q.eq("active", true))
    .first();
};
