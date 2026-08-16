import { mutation } from "./_generated/server";
import { v } from "convex/values";

/** TEMPORARY — tests whether internal runMutation inherits the CLI identity. */
export const ping = mutation({
  args: {
    inningsId: v.string(),
    bowlerId: v.string(),
  },
  handler: async (ctx, args) => {
    const r = await (
      ctx as unknown as {
        runMutation: (name: string, args: unknown) => Promise<unknown>;
      }
    ).runMutation("scoring:setBowler", {
      inningsId: args.inningsId,
      bowlerId: args.bowlerId,
    });
    return { inherited: true, r };
  },
});
