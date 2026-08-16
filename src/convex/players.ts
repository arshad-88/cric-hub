import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { bowlerCredited, isLegalBall } from "./cricket";
import { careerPerPlayerId } from "./career";
import { normalizePhone, requireOrganizer } from "./helpers";
import { playerRoleValidator, WICKET_TYPE } from "./schema";

/**
 * Public player profile: personal info + career stats (batting, bowling,
 * fielding) merged across every squad carrying the same phone number, plus
 * recent match-by-match performances and auction history.
 */
export const getProfile = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (!player) return null;
    const team = await ctx.db.get(player.teamId);
    const tournament = team ? await ctx.db.get(team.tournamentId) : null;

    // ---- identity group: every roster doc sharing the phone ----------------
    const allPlayers = await ctx.db.query("players").collect();
    const docs = player.phone
      ? allPlayers.filter((p) => p.phone === player.phone)
      : [player];
    const ids = new Set(docs.map((d) => String(d._id)));
    const teamIds = new Set(docs.map((d) => String(d.teamId)));
    const allTeams = await ctx.db.query("teams").collect();
    const leagues = new Set<string>();
    for (const t of allTeams) {
      if (teamIds.has(String(t._id))) leagues.add(String(t.tournamentId));
    }

    // ---- career line -------------------------------------------------------
    const perPlayer = await careerPerPlayerId(ctx);
    const line = {
      matches: 0,
      innings: 0,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      wickets: 0,
      ballsBowled: 0,
      runsConceded: 0,
      catches: 0,
      runOuts: 0,
      stumpings: 0,
    };
    for (const doc of docs) {
      const l = perPlayer.get(String(doc._id));
      if (!l) continue;
      line.matches = Math.max(line.matches, l.matches);
      line.innings += l.innings;
      line.runs += l.runs;
      line.balls += l.balls;
      line.fours += l.fours;
      line.sixes += l.sixes;
      line.wickets += l.wickets;
      line.ballsBowled += l.ballsBowled;
      line.runsConceded += l.runsConceded;
    }

    // ---- recent performances (last 8 matches, newest first) ----------------
    const deliveries = await ctx.db.query("deliveries").collect();
    const byMatch = new Map<
      string,
      { runs: number; balls: number; fours: number; sixes: number; wickets: number; runsConceded: number; ballsBowled: number; catches: number; runOuts: number; out: boolean }
    >();
    for (const d of deliveries) {
      const involves =
        ids.has(String(d.batsmanId)) ||
        ids.has(String(d.bowlerId)) ||
        (d.fielderId != null && ids.has(String(d.fielderId)));
      if (!involves) continue;
      let m = byMatch.get(String(d.matchId));
      if (!m) {
        m = { runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, runsConceded: 0, ballsBowled: 0, catches: 0, runOuts: 0, out: false };
        byMatch.set(String(d.matchId), m);
      }
      if (ids.has(String(d.batsmanId))) {
        if (isLegalBall(d.extraType)) m.balls += 1;
        m.runs += d.runsScored;
        if (d.runsScored === 4) m.fours += 1;
        if (d.runsScored === 6) m.sixes += 1;
        if (d.isWicket && d.dismissedBatterId != null && ids.has(String(d.dismissedBatterId))) m.out = true;
      }
      if (ids.has(String(d.bowlerId))) {
        if (isLegalBall(d.extraType)) m.ballsBowled += 1;
        m.runsConceded += d.totalRuns;
        if (bowlerCredited(d)) m.wickets += 1;
      }
      if (d.fielderId != null && ids.has(String(d.fielderId))) {
        if (d.isWicket && d.wicketType === WICKET_TYPE.CAUGHT) m.catches += 1;
        else if (d.isWicket && d.wicketType === WICKET_TYPE.RUN_OUT) m.runOuts += 1;
      }
    }
    let fifties = 0;
    let hundreds = 0;
    let dismissals = 0;
    let threeWkts = 0;
    let fourWkts = 0;
    let fiveWkts = 0;
    for (const m of byMatch.values()) {
      if (m.runs >= 100) hundreds += 1;
      else if (m.runs >= 50) fifties += 1;
      if (m.out) dismissals += 1;
      if (m.wickets >= 5) fiveWkts += 1;
      else if (m.wickets >= 4) fourWkts += 1;
      else if (m.wickets >= 3) threeWkts += 1;
    }
    const matchDocs = (
      await Promise.all([...byMatch.keys()].map((id) => ctx.db.get(id as Id<"matches">)))
    ).filter((m) => m !== null);
    const matchById = new Map(matchDocs.map((m) => [String(m!._id), m!]));
    const recentRaw = [...byMatch.entries()]
      .map(([matchId, m]) => {
        const md = matchById.get(matchId);
        const other =
          md && String(md.teamAId) === String(player.teamId)
            ? (md.teamBId as Id<"teams">)
            : md
              ? (md.teamAId as Id<"teams">)
              : null;
        return {
          matchId,
          opponentId: other,
          startTime: md?.startTime ?? 0,
          result: md?.result ?? null,
          ...m,
        };
      })
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 8);
    const oppNames = new Map(
      (
        await Promise.all(
          recentRaw
            .map((r) => r.opponentId)
            .filter((o): o is Id<"teams"> => o != null)
            .map((id) => ctx.db.get(id)),
        )
      )
        .filter((t) => t !== null)
        .map((t) => [String(t!._id), t!.name]),
    );
    const recent = recentRaw.map(({ opponentId, ...rest }) => ({
      ...rest,
      opponent: opponentId ? (oppNames.get(String(opponentId)) ?? null) : null,
    }));

    // ---- fielding totals across all deliveries (not just matches) -----------
    for (const d of deliveries) {
      if (!d.isWicket || !d.fielderId || !ids.has(String(d.fielderId))) continue;
      if (d.wicketType === WICKET_TYPE.CAUGHT) line.catches += 1;
      else if (d.wicketType === WICKET_TYPE.RUN_OUT) line.runOuts += 1;
      else if (d.wicketType === WICKET_TYPE.STUMPED) line.stumpings += 1;
    }

    // ---- auction history ----------------------------------------------------
    const auctions = await ctx.db.query("auctions").order("desc").take(30);
    const auctionHistory: {
      room: string;
      price: number;
      team: string | null;
      sold: boolean;
      date: number;
    }[] = [];
    for (const a of auctions) {
      const teams = await ctx.db
        .query("auctionTeams")
        .withIndex("by_auction", (q) => q.eq("auctionId", a._id))
        .collect();
      const soldHit = teams
        .flatMap((t) => t.sold.map((s) => ({ s, t })))
        .find(({ s }) => s.playerKey === String(playerId));
      if (soldHit) {
        auctionHistory.push({
          room: a.title,
          price: soldHit.s.price,
          team: soldHit.t.name,
          sold: true,
          date: a.updatedAt,
        });
      } else if (a.pool.some((p) => p.key === String(playerId))) {
        const base = a.pool.find((p) => p.key === String(playerId));
        auctionHistory.push({
          room: a.title,
          price: base?.basePrice ?? 0,
          team: null,
          sold: false,
          date: a.updatedAt,
        });
      }
    }

    return {
      player: {
        _id: player._id,
        name: player.name,
        role: player.role,
        battingStyle: player.battingStyle ?? null,
        bowlingStyle: player.bowlingStyle ?? null,
        jerseyNumber: player.jerseyNumber ?? null,
        phone: player.phone ?? null,
        isPlayingXI: player.isPlayingXI ?? false,
        isCaptain: player.isCaptain ?? false,
        isViceCaptain: player.isViceCaptain ?? false,
      },
      team: team
        ? {
            _id: team._id,
            name: team.name,
            shortCode: team.shortCode,
            color: team.color,
            captainId: team.captainId ? String(team.captainId) : null,
            coach: team.coach ?? null,
          }
        : null,
      tournament: tournament
        ? { _id: tournament._id, name: tournament.name, year: tournament.year }
        : null,
      leagues: leagues.size,
      batting: {
        matches: line.matches,
        innings: line.innings,
        runs: line.runs,
        balls: line.balls,
        fours: line.fours,
        sixes: line.sixes,
        sr: line.balls > 0 ? Number(((line.runs / line.balls) * 100).toFixed(1)) : 0,
        avg: dismissals > 0 ? Number((line.runs / dismissals).toFixed(2)) : line.runs > 0 ? line.runs : 0,
        fifties,
        hundreds,
      },
      bowling: {
        matches: line.matches,
        overs: formatOversLocal(line.ballsBowled),
        balls: line.ballsBowled,
        runs: line.runsConceded,
        wickets: line.wickets,
        econ: line.ballsBowled > 0 ? Number((line.runsConceded / (line.ballsBowled / 6)).toFixed(2)) : 0,
        threeWkts,
        fourWkts,
        fiveWkts,
      },
      fielding: {
        catches: line.catches,
        runOuts: line.runOuts,
        stumpings: line.stumpings,
      },
      recent,
      auctionHistory,
    };
  },
});

function formatOversLocal(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export const listByTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    return players.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** All squads of a tournament, grouped by team (admin roster screen). */
export const listByTournament = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();
    const players = await ctx.db.query("players").collect();
    const byTeam = players.filter((p) =>
      teams.some((t) => t._id === p.teamId),
    );
    return { teams, players: byTeam };
  },
});

/**
 * A team has exactly one captain and one vice-captain. When a player is
 * (vice-)captain, every other (vice-)captain in the same squad is demoted so
 * the badge never ends up on two players — and the team's captainId is kept
 * pointing at the current captain.
 */
async function normalizeLeadership(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  selfId: Id<"players">,
  isCaptain: boolean,
  isViceCaptain: boolean,
): Promise<void> {
  const squad = await ctx.db
    .query("players")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();
  if (isCaptain) {
    for (const p of squad) {
      if (p._id !== selfId && p.isCaptain) {
        await ctx.db.patch(p._id, { isCaptain: false });
      }
    }
    const team = await ctx.db.get(teamId);
    if (team) await ctx.db.patch(teamId, { captainId: selfId });
  }
  if (isViceCaptain) {
    for (const p of squad) {
      if (p._id !== selfId && p.isViceCaptain) {
        await ctx.db.patch(p._id, { isViceCaptain: false });
      }
    }
  }
}

/** Organizer: add a player to a squad (styles + team role). Every player is
 *  eligible to bat and bowl, so there is no manual batting/bowling role — the
 *  stored role defaults to "All-rounder" for compatibility with existing
 *  leaderboards and auction squads. */
export const create = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    phone: v.optional(v.string()),
    role: v.optional(playerRoleValidator),
    battingStyle: v.optional(v.string()),
    bowlingStyle: v.optional(v.string()),
    jerseyNumber: v.optional(v.number()),
    isCaptain: v.optional(v.boolean()),
    isViceCaptain: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found.");
    await requireOrganizer(ctx, team.tournamentId);
    const playerId = await ctx.db.insert("players", {
      teamId: args.teamId,
      name: args.name,
      // Store the canonical (E.164-style) number — the same normalization the
      // account profile and co-organizer lookup use. Storing the raw digits
      // broke phone-based identity: roster autofill and career merging compare
      // against the normalized number on the user account, so they silently
      // stopped matching.
      phone: args.phone ? normalizePhone(args.phone) : undefined,
      role: args.role ?? "All-rounder",
      battingStyle: args.battingStyle,
      bowlingStyle: args.bowlingStyle,
      jerseyNumber: args.jerseyNumber,
      isCaptain: args.isCaptain || undefined,
      isViceCaptain: args.isViceCaptain || undefined,
    });
    if (args.isCaptain || args.isViceCaptain) {
      await normalizeLeadership(ctx, args.teamId, playerId, !!args.isCaptain, !!args.isViceCaptain);
    }
    return playerId;
  },
});

/** Organizer: edit a player's details. */
export const update = mutation({
  args: {
    playerId: v.id("players"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(playerRoleValidator),
    battingStyle: v.optional(v.string()),
    bowlingStyle: v.optional(v.string()),
    jerseyNumber: v.optional(v.number()),
    isCaptain: v.optional(v.boolean()),
    isViceCaptain: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) throw new Error("Player not found.");
    const team = await ctx.db.get(player.teamId);
    if (!team) throw new Error("Team not found.");
    await requireOrganizer(ctx, team.tournamentId);
    await ctx.db.patch(args.playerId, {
      name: args.name ?? player.name,
      phone: args.phone ? normalizePhone(args.phone) : player.phone,
      role: args.role ?? player.role ?? "All-rounder",
      battingStyle: args.battingStyle !== undefined ? args.battingStyle : player.battingStyle,
      bowlingStyle: args.bowlingStyle !== undefined ? args.bowlingStyle : player.bowlingStyle,
      jerseyNumber: args.jerseyNumber !== undefined ? args.jerseyNumber : player.jerseyNumber,
      isCaptain: args.isCaptain !== undefined ? args.isCaptain : player.isCaptain,
      isViceCaptain: args.isViceCaptain !== undefined ? args.isViceCaptain : player.isViceCaptain,
    });
    if (args.isCaptain || args.isViceCaptain) {
      await normalizeLeadership(
        ctx,
        player.teamId,
        player._id,
        !!args.isCaptain,
        !!args.isViceCaptain,
      );
    }
    return args.playerId;
  },
});

/** Organizer: remove a player from a squad. */
export const remove = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("Player not found.");
    const team = await ctx.db.get(player.teamId);
    if (!team) throw new Error("Team not found.");
    await requireOrganizer(ctx, team.tournamentId);
    await ctx.db.delete(playerId);
    return playerId;
  },
});
