import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { getCurrentUserAny, normalizePhone } from "./helpers";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

/** Let a user set the name shown to organizers (and optionally their phone). */
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, { name, phone }) => {
    const user = await getCurrentUserAny(ctx);
    if (!user) throw new ConvexError("Sign in to continue.");
    const normalized = phone ? normalizePhone(phone) : "";
    await ctx.db.patch(user._id, {
      name: name && name.trim() ? name.trim() : user.name,
      phone: normalized || user.phone,
    });
    return user._id;
  },
});

/**
 * Roster autofill: given a phone number, return the registered account's
 * name (signed-in callers only). Returns null when the number is unknown —
 * organizers can still enter a player manually.
 */
export const lookupByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", normalized))
      .first();
    if (!user) return null;
    return { name: user.name ?? "Player", phone: user.phone ?? normalized };
  },
});
