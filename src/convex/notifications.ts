// ---------------------------------------------------------------------------
// notifications.ts — live match events + web push delivery.
//
// Every key moment the scorer records (wickets, fifties/centuries, team
// milestones, innings breaks, results, super overs) is written to `matchEvents`
// by scoring.ts. Clients subscribe to these reactively for in-app web alerts
// and browser notifications; signed-in users who follow a match and enable
// notifications get web-push messages even when the tab is closed.
//
// VAPID keys are generated once on first use (self-bootstrapping — nothing to
// configure) and stored in the `settings` table. Sending runs in a "use node"
// action so it can use Node's crypto + web-push.
// ---------------------------------------------------------------------------

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export type MatchEventType =
  | "wicket"
  | "milestone"
  | "team_milestone"
  | "live"
  | "innings"
  | "result"
  | "tie"
  | "superover";

// ---- internal helpers -------------------------------------------------------

export const recordEvent = internalMutation({
  args: {
    matchId: v.id("matches"),
    type: v.union(
      v.literal("wicket"),
      v.literal("milestone"),
      v.literal("team_milestone"),
      v.literal("live"),
      v.literal("innings"),
      v.literal("result"),
      v.literal("tie"),
      v.literal("superover"),
    ),
    title: v.string(),
    message: v.string(),
    overLabel: v.optional(v.string()),
    inningsNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const eventId = await ctx.db.insert("matchEvents", {
      matchId: args.matchId,
      type: args.type,
      title: args.title,
      message: args.message,
      overLabel: args.overLabel,
      inningsNumber: args.inningsNumber,
    });
    // Fire the push delivery after the write commits (best-effort; failures
    // are swallowed by the action).
    await ctx.scheduler.runAfter(0, internal.notificationsPush.sendPushForEvent, {
      eventId,
    });
    return eventId;
  },
});

export const getEvent = internalQuery({
  args: { eventId: v.id("matchEvents") },
  handler: async (ctx, { eventId }) => {
    return await ctx.db.get(eventId);
  },
});

export const getMatch = internalQuery({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    return await ctx.db.get(matchId);
  },
});

export const getSetting = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    return await ctx.db.query("settings").withIndex("by_key", (q) => q.eq("key", key)).first();
  },
});

export const setSetting = internalMutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, { key, value }) => {
    const existing = await ctx.db.query("settings").withIndex("by_key", (q) => q.eq("key", key)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { value });
    } else {
      await ctx.db.insert("settings", { key, value });
    }
  },
});

export const deleteSubscription = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const sub = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();
    if (sub) await ctx.db.delete(sub._id);
  },
});

/** Push targets for a match: followers' subscriptions. */
export const subsForMatch = internalQuery({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const follows = await ctx.db
      .query("matchFollows")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const userIds = new Set(follows.map((f) => String(f.userId)));
    if (userIds.size === 0) return [];
    const all = await ctx.db.query("pushSubscriptions").collect();
    return all.filter((s) => s.userId && userIds.has(String(s.userId)));
  },
});

// ---- public queries ---------------------------------------------------------

export interface EventRow {
  id: string;
  matchId: string;
  type: MatchEventType;
  title: string;
  message: string;
  overLabel?: string;
  matchLabel: string;
  createdAt: number;
}

/** Latest key events from matches that are live (for the bell + toasts). */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const take = Math.min(60, limit ?? 25);
    // No explicit index → Convex uses the implicit _creationTime ordering.
    const rows = await ctx.db.query("matchEvents").order("desc").take(take);

    const matchIds = [...new Set(rows.map((r) => r.matchId))];
    const matches = (
      await Promise.all(matchIds.map((id) => ctx.db.get(id)))
    ).filter((m) => m !== null);
    const matchMap = new Map(matches.map((m) => [m!._id, m!]));

    const teamIds = new Set<Id<"teams">>();
    for (const m of matches) {
      teamIds.add(m!.teamAId);
      teamIds.add(m!.teamBId);
    }
    const teamDocs = (await Promise.all([...teamIds].map((id) => ctx.db.get(id)))).filter(
      (t) => t !== null,
    );
    const teamMap = new Map(teamDocs.map((t) => [t!._id, t!]));

    const out: EventRow[] = [];
    for (const r of rows) {
      const match = matchMap.get(r.matchId);
      if (!match) continue;
      // Only surface events tied to a match that is still relevant (live or
      // just completed within a short window is fine — include everything we
      // fetched to keep the bell useful).
      const a = teamMap.get(match.teamAId);
      const b = teamMap.get(match.teamBId);
      out.push({
        id: r._id,
        matchId: r.matchId,
        type: r.type as MatchEventType,
        title: r.title,
        message: r.message,
        overLabel: r.overLabel,
        matchLabel: `${a?.shortCode ?? "?"} v ${b?.shortCode ?? "?"}`,
        createdAt: r._creationTime,
      });
    }
    return out;
  },
});

/** Events for one match (match center feed). */
export const listForMatch = query({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const rows = await ctx.db
      .query("matchEvents")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .order("desc")
      .take(50);
    return rows.map((r) => ({
      id: r._id,
      matchId: r.matchId,
      type: r.type as MatchEventType,
      title: r.title,
      message: r.message,
      overLabel: r.overLabel,
      createdAt: r._creationTime,
    }));
  },
});

/** Match ids the signed-in user follows (empty for visitors). */
export const myFollows = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("matchFollows")
      .withIndex("by_user_match", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => String(r.matchId));
  },
});

// ---- follow / subscription mutations ---------------------------------------

async function requireUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to follow matches.");
  return userId;
}

export const followMatch = mutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("matchFollows")
      .withIndex("by_user_match", (q) => q.eq("userId", userId).eq("matchId", matchId))
      .first();
    if (!existing) await ctx.db.insert("matchFollows", { userId, matchId });
    return true;
  },
});

export const unfollowMatch = mutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("matchFollows")
      .withIndex("by_user_match", (q) => q.eq("userId", userId).eq("matchId", matchId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return true;
  },
});

/** Store (upsert) the browser's push subscription for the signed-in user. */
export const subscribePush = mutation({
  args: { endpoint: v.string(), auth: v.string(), p256dh: v.string() },
  handler: async (ctx, { endpoint, auth, p256dh }) => {
    const userId = await getAuthUserId(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { auth, p256dh, userId: userId ?? undefined });
    } else {
      await ctx.db.insert("pushSubscriptions", {
        endpoint,
        auth,
        p256dh,
        userId: userId ?? undefined,
      });
    }
    return true;
  },
});

export const unsubscribePush = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return true;
  },
});

export type PushSubscriptionDoc = Doc<"pushSubscriptions">;
