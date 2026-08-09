// ---------------------------------------------------------------------------
// helpers.ts — shared Convex-side helpers (auth gating + active tournament)
//
// Permission model: there is NO global admin role. Any signed-in user can
// create a tournament and becomes its organizer. Only the organizers of a
// tournament (the creator plus anyone they added by phone) may edit it,
// manage teams/rosters or score its matches.
// ---------------------------------------------------------------------------

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type Ctx = QueryCtx | MutationCtx;

/** Current signed-in user document, or null. */
export const getCurrentUserAny = async (ctx: Ctx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get(userId);
};

/** Throws unless the caller is signed in; returns the user document. */
export const requireUser = async (ctx: Ctx) => {
  const user = await getCurrentUserAny(ctx);
  if (!user) {
    throw new ConvexError("Sign in to continue.");
  }
  return user;
};

/** True when the caller is one of the tournament's organizers. */
export const isOrganizer = async (
  ctx: Ctx,
  tournamentId: Id<"tournaments">,
) => {
  const user = await getCurrentUserAny(ctx);
  if (!user) return false;
  const tournament = await ctx.db.get(tournamentId);
  if (!tournament) return false;
  return tournament.organizers.some((id) => id === user._id);
};

/** Throws unless the caller is an organizer of the given tournament. */
export const requireOrganizer = async (
  ctx: Ctx,
  tournamentId: Id<"tournaments">,
) => {
  const user = await requireUser(ctx);
  const tournament = await ctx.db.get(tournamentId);
  if (!tournament) throw new ConvexError("Tournament not found.");
  if (!tournament.organizers.some((id) => id === user._id)) {
    throw new ConvexError(
      "Only the tournament organizer can make changes — ask them to add you by phone.",
    );
  }
  return { user, tournament };
};

/** The single tournament that powers the public pages. */
export const getActiveTournament = async (ctx: Ctx) => {
  return await ctx.db
    .query("tournaments")
    .withIndex("by_active", (q) => q.eq("active", true))
    .first();
};

/**
 * Canonicalize a phone number to a plain E.164-style string.
 * 10-digit Indian numbers get the +91 prefix; anything longer keeps its
 * country code. Used by phone sign-in, profile edits and roster lookups.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return `+${digits}`;
}
