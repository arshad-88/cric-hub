// Phone-number sign-in (no OTP, no password). Everyone uses their mobile
// number as the login handle: the first time a number appears we create the
// user (name is optional and editable later), afterwards the same account is
// returned. Sessions are managed by Convex Auth exactly like any provider.
//
// NOTE (vly auth docs): this file may be modified to add a new auth provider
// in accordance with the vly auth documentation — ConvexCredentials is the
// sanctioned way to implement custom credential flows like phone login.

import { convexAuth } from "@convex-dev/auth/server";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { normalizePhone } from "./helpers";

/** Internal: find an account by its canonical phone number. */
export const findUserByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
  },
});

/** Internal: create an account for a brand-new phone number. */
export const createUserFromPhone = internalMutation({
  args: { phone: v.string(), name: v.string() },
  handler: async (ctx, { phone, name }) => {
    return await ctx.db.insert("users", {
      phone,
      name: name || "Player",
      role: "user",
    });
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ConvexCredentials({
      id: "phone",
      authorize: async (credentials, ctx) => {
        const rawPhone =
          typeof credentials.phone === "string" ? credentials.phone : "";
        const name =
          typeof credentials.name === "string" ? credentials.name.trim() : "";
        const phone = normalizePhone(rawPhone);
        if (phone.length < 12) {
          throw new Error("Enter a valid phone number.");
        }

        // Existing account → sign straight back in.
        const existing = await ctx.runQuery(internal.auth.findUserByPhone, {
          phone,
        });
        if (existing) return { userId: existing._id };

        // New number → create the account, then sign in.
        const userId = await ctx.runMutation(
          internal.auth.createUserFromPhone,
          { phone, name: name || "Player" },
        );
        return { userId };
      },
    }),
  ],
});
