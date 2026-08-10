// ---------------------------------------------------------------------------
// auction.ts — multiplayer auction engine (real IPL + local custom modes).
//
// A room is an `auctions` row with a snapshot `pool` of players. Joined
// friends each own an `auctionTeams` row (purse + sold list). The auctioneer
// (host) calls players; anyone with a team raises the bid; the host sells or
// passes. All state lives in Convex so every phone in the room updates
// reactively — exactly like the live scoring layer.
// ---------------------------------------------------------------------------

import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  careerFromDeliveries,
  formFromDeliveries,
  type DeliveriesRow,
} from "./career";
import { requireUser, type Ctx } from "./helpers";
import { IPL_PLAYERS, type IplStatLine } from "./iplCatalog";

// ---- shared shapes ---------------------------------------------------------

export type PoolPlayer = {
  key: string;
  name: string;
  role: string;
  basePrice: number;
  photoUrl?: string;
  wiki?: string;
  teamShort?: string;
  career?: IplStatLine;
  form?: IplStatLine;
};

const BID_WINDOW_MS = 45_000; // first call window
const BID_EXTEND_MS = 12_000; // every raise extends the window

function roomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const TEAM_COLORS = ["#22c55e", "#22d3ee", "#facc15", "#f97316", "#ef4444", "#a78bfa", "#34d399", "#f472b6", "#60a5fa", "#fbbf24"];

async function uniqueRoomCode(ctx: QueryCtx): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = roomCode();
    const existing = await ctx.db
      .query("auctions")
      .withIndex("by_room_code", (q) => q.eq("roomCode", code))
      .first();
    if (!existing) return code;
  }
  throw new Error("Could not allocate a room code — try again.");
}

// ---- queries ---------------------------------------------------------------

/** Public list of auction rooms (hub page). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rooms = await ctx.db.query("auctions").order("desc").take(50);
    const withTeams = [];
    for (const r of rooms) {
      const teams = await ctx.db
        .query("auctionTeams")
        .withIndex("by_auction", (q) => q.eq("auctionId", r._id))
        .collect();
      withTeams.push({
        id: r._id,
        mode: r.mode,
        title: r.title,
        hostName: r.hostName,
        status: r.status,
        roomCode: r.roomCode,
        purse: r.purse,
        squadSize: r.squadSize,
        playersCount: r.pool.length,
        soldCount: r.soldCount,
        teamsCount: teams.length,
        updatedAt: r.updatedAt,
      });
    }
    return withTeams;
  },
});

/** Full room state for the live board. */
export const get = query({
  args: { auctionId: v.id("auctions") },
  handler: async (ctx, { auctionId }) => {
    const auction = await ctx.db.get(auctionId);
    if (!auction) return null;
    const teams = await ctx.db
      .query("auctionTeams")
      .withIndex("by_auction", (q) => q.eq("auctionId", auctionId))
      .collect();
    // Resolve only the team owners — never scan the whole users table, which
    // would slow down (and re-run for) every spectator in the room.
    const userMap = new Map();
    for (const t of teams) {
      if (!userMap.has(t.ownerId)) {
        const owner = await ctx.db.get(t.ownerId);
        if (owner) userMap.set(owner._id, owner);
      }
    }
    return {
      ...auction,
      teams: teams.map((t) => ({
        _id: t._id,
        ownerId: t.ownerId,
        name: t.name,
        color: t.color,
        ownerName: userMap.get(t.ownerId)?.name ?? "Player",
        purseRemaining: t.purseRemaining,
        soldCount: t.sold.length,
        sold: t.sold,
      })),
      currentBidderName: auction.currentBidderTeamId
        ? (teams.find((t) => t._id === auction.currentBidderTeamId)?.name ?? null)
        : null,
    };
  },
});

/** Resolve a join code → auction id. */
export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = code.replace(/\D/g, "");
    if (normalized.length < 4) return null;
    const auction = await ctx.db
      .query("auctions")
      .withIndex("by_room_code", (q) => q.eq("roomCode", normalized))
      .first();
    return auction ? auction._id : null;
  },
});

// ---- creation --------------------------------------------------------------

function roleLabel(role: string): string {
  if (role === "Batsman") return "Batter";
  if (role === "All-rounder") return "All-rounder";
  return "Bowler";
}

/** Build the pool for a custom auction from a tournament's local rosters. */
async function buildCustomPool(
  ctx: Ctx,
  tournamentId: Id<"tournaments">,
): Promise<PoolPlayer[]> {
  const teams = await ctx.db
    .query("teams")
    .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
    .collect();
  const teamMap = new Map(teams.map((t) => [t._id, t]));
  const allPlayers = await ctx.db.query("players").collect();

  // Group every roster doc by its canonical phone so identity lookups are O(1)
  // instead of scanning the whole players table once per player.
  const byPhone = new Map<
    string,
    { _id: Id<"players">; teamId: Id<"teams">; name: string }[]
  >();
  for (const p of allPlayers) {
    if (!p.phone) continue;
    const arr = byPhone.get(p.phone) ?? [];
    arr.push({ _id: p._id, teamId: p.teamId, name: p.name });
    byPhone.set(p.phone, arr);
  }

  // Fetch all deliveries once; career/form aggregation below reuses this
  // single snapshot instead of scanning the deliveries table per player.
  const deliveries = await ctx.db.query("deliveries").collect();

  const pool: PoolPlayer[] = [];
  for (const p of allPlayers) {
    const team = teamMap.get(p.teamId);
    if (!team) continue;
    // identity: all docs sharing this phone (or just this doc)
    const docs = p.phone
      ? byPhone.get(p.phone) ?? [{ _id: p._id, teamId: p.teamId, name: p.name }]
      : [{ _id: p._id, teamId: p.teamId, name: p.name }];
    const ids = new Set(docs.map((d) => String(d._id)));
    const career = careerFromDeliveries(
      deliveries as readonly DeliveriesRow[],
      ids,
    );
    const form = formFromDeliveries(
      deliveries as readonly DeliveriesRow[],
      ids,
      3,
    );
    pool.push({
      key: String(p._id),
      name: p.name,
      role: roleLabel(p.role),
      basePrice: 50, // ₹50 lakh default
      teamShort: team.shortCode,
      career:
        career.matches > 0
          ? {
              matches: career.matches,
              runs: career.runs,
              wickets: career.wickets,
              sr: career.balls > 0 ? Number(((career.runs / career.balls) * 100).toFixed(1)) : 0,
              econ: career.ballsBowled > 0 ? Number((career.runsConceded / (career.ballsBowled / 6)).toFixed(2)) : 0,
            }
          : undefined,
      form:
        form.matches > 0
          ? {
              matches: form.matches,
              runs: form.runs,
              wickets: form.wickets,
              sr: form.balls > 0 ? Number(((form.runs / form.balls) * 100).toFixed(1)) : 0,
              econ: form.ballsBowled > 0 ? Number((form.runsConceded / (form.ballsBowled / 6)).toFixed(2)) : 0,
            }
          : undefined,
    });
  }
  // marquee local players first, by career runs then wickets
  pool.sort(
    (a, b) =>
      (b.career?.runs ?? 0) - (a.career?.runs ?? 0) ||
      (b.career?.wickets ?? 0) - (a.career?.wickets ?? 0),
  );
  return pool;
}

export const create = mutation({
  args: {
    mode: v.union(v.literal("ipl"), v.literal("custom")),
    title: v.string(),
    tournamentId: v.optional(v.id("tournaments")),
    purse: v.number(),
    squadSize: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const title = args.title.trim() || (args.mode === "ipl" ? "IPL Mega Auction" : "Local Auction");

    let pool: PoolPlayer[];
    if (args.mode === "ipl") {
      pool = IPL_PLAYERS.map((p) => ({
        key: p.key,
        name: p.name,
        role: p.role,
        basePrice: p.base,
        wiki: p.wiki,
        teamShort: p.team,
        career: p.career,
        form: p.form,
      }));
    } else {
      if (!args.tournamentId) throw new Error("Pick a tournament for a custom auction.");
      pool = await buildCustomPool(ctx, args.tournamentId);
      if (pool.length === 0) throw new Error("That tournament has no players yet.");
    }

    const auctionId = await ctx.db.insert("auctions", {
      mode: args.mode,
      title,
      hostId: user._id,
      hostName: user.name ?? "Host",
      tournamentId: args.mode === "custom" ? args.tournamentId : undefined,
      purse: args.purse,
      squadSize: args.squadSize,
      status: "SETUP",
      roomCode: await uniqueRoomCode(ctx),
      pool: pool.map((p) => ({ ...p })),
      soldCount: 0,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("auctionTeams", {
      auctionId,
      ownerId: user._id,
      name: user.name ? `${user.name}'s XI` : "My XI",
      color: TEAM_COLORS[0],
      purseRemaining: args.purse,
      sold: [],
    });

    return auctionId;
  },
});

/** Join an open room with a team name. */
export const join = mutation({
  args: { auctionId: v.id("auctions"), teamName: v.string() },
  handler: async (ctx, { auctionId, teamName }) => {
    const user = await requireUser(ctx);
    const auction = await ctx.db.get(auctionId);
    if (!auction) throw new Error("Room not found.");
    if (auction.status === "COMPLETED") throw new Error("This auction has already finished.");

    const teams = await ctx.db
      .query("auctionTeams")
      .withIndex("by_auction", (q) => q.eq("auctionId", auctionId))
      .collect();
    if (teams.some((t) => t.ownerId === user._id)) {
      throw new Error("You already have a team in this room.");
    }
    const color = TEAM_COLORS[teams.length % TEAM_COLORS.length];
    await ctx.db.insert("auctionTeams", {
      auctionId,
      ownerId: user._id,
      name: teamName.trim() || (user.name ? `${user.name}'s XI` : "My XI"),
      color,
      purseRemaining: auction.purse,
      sold: [],
    });
    return auctionId;
  },
});

// ---- live auction ----------------------------------------------------------

/** Auctioneer only: call the next player to the block. */
export const startPlayer = mutation({
  args: { auctionId: v.id("auctions"), index: v.number() },
  handler: async (ctx, { auctionId, index }) => {
    const user = await requireUser(ctx);
    const auction = await ctx.db.get(auctionId);
    if (!auction) throw new Error("Room not found.");
    if (auction.hostId !== user._id) throw new Error("Only the auctioneer can call players.");
    if (index < 0 || index >= auction.pool.length) throw new Error("Player index out of range.");
    if (auction.currentIndex != null) throw new Error("A player is already on the block.");
    const player = auction.pool[index];
    await ctx.db.patch(auctionId, {
      status: "LIVE",
      currentIndex: index,
      currentBid: player.basePrice,
      currentBidderTeamId: undefined,
      bidEndsAt: Date.now() + BID_WINDOW_MS,
      updatedAt: Date.now(),
    });
    return auctionId;
  },
});

/** Any team in the room: raise the bid. */
export const placeBid = mutation({
  args: { auctionId: v.id("auctions"), amount: v.number() },
  handler: async (ctx, { auctionId, amount }) => {
    const user = await requireUser(ctx);
    const auction = await ctx.db.get(auctionId);
    if (!auction) throw new Error("Room not found.");
    if (auction.status !== "LIVE" || auction.currentIndex == null || auction.currentBid == null) {
      throw new Error("No player is on the block right now.");
    }
    if (auction.bidEndsAt != null && Date.now() > auction.bidEndsAt) {
      throw new Error("Bidding for this player has ended.");
    }
    const teams = await ctx.db
      .query("auctionTeams")
      .withIndex("by_auction", (q) => q.eq("auctionId", auctionId))
      .collect();
    const mine = teams.find((t) => t.ownerId === user._id);
    if (!mine) throw new Error("Join the room with a team before bidding.");
    if (amount <= auction.currentBid) throw new Error("Your bid must be higher than the current bid.");
    if (amount > mine.purseRemaining) throw new Error("Your team does not have enough purse left.");

    await ctx.db.patch(auctionId, {
      currentBid: amount,
      currentBidderTeamId: mine._id,
      bidEndsAt: (auction.bidEndsAt ?? Date.now()) + BID_EXTEND_MS,
      updatedAt: Date.now(),
    });
    return auctionId;
  },
});

/** Auctioneer only: sell to the highest bidder, or send unsold. */
export const finishPlayer = mutation({
  args: { auctionId: v.id("auctions"), sold: v.boolean() },
  handler: async (ctx, { auctionId, sold }) => {
    const user = await requireUser(ctx);
    const auction = await ctx.db.get(auctionId);
    if (!auction) throw new Error("Room not found.");
    if (auction.hostId !== user._id) throw new Error("Only the auctioneer can finish a player.");
    if (auction.currentIndex == null || auction.currentBid == null) {
      throw new Error("No player is on the block.");
    }
    const player = auction.pool[auction.currentIndex];
    const bidderTeamId = auction.currentBidderTeamId;

    if (sold && bidderTeamId) {
      const bidder = await ctx.db.get(bidderTeamId);
      if (bidder) {
        await ctx.db.patch(bidderTeamId, {
          purseRemaining: bidder.purseRemaining - auction.currentBid,
          sold: [
            ...bidder.sold,
            {
              playerKey: player.key,
              name: player.name,
              role: player.role,
              price: auction.currentBid,
              photoUrl: player.photoUrl,
              wiki: player.wiki,
              teamShort: player.teamShort,
              career: player.career,
              form: player.form,
            },
          ],
        });
      }
    }

    const soldCount = auction.soldCount + 1;
    const completed = soldCount >= auction.pool.length;
    await ctx.db.patch(auctionId, {
      soldCount,
      currentIndex: undefined,
      currentBid: undefined,
      currentBidderTeamId: undefined,
      bidEndsAt: undefined,
      status: completed ? "COMPLETED" : "LIVE",
      updatedAt: Date.now(),
    });
    return { completed, sold: sold && bidderTeamId != null };
  },
});
