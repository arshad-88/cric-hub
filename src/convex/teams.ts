import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { isLegalBall } from "./cricket";
import { getActiveTournament, requireOrganizer } from "./helpers";

/** Teams of the active tournament (public). */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const tournament = await getActiveTournament(ctx);
    if (!tournament) return [];
    return await listByTournamentId(ctx, tournament._id);
  },
});

/** Teams of any tournament (public) — powers the tournament pages. */
export const listByTournament = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    return await listByTournamentId(ctx, tournamentId);
  },
});

async function listByTournamentId(
  ctx: QueryCtx,
  tournamentId: Id<"tournaments">,
) {
  const teams = await ctx.db
    .query("teams")
    .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
    .collect();
  return teams.sort((a, b) => a.name.localeCompare(b.name));
}

export const get = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    return await ctx.db.get(teamId);
  },
});

/** Team page: squad + recent matches with opponent and result. */
export const getDetail = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const team = await ctx.db.get(teamId);
    if (!team) return null;
    const tournament = await ctx.db.get(team.tournamentId);
    const players = await ctx.db
      .query("players")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    const aMatches = await ctx.db
      .query("matches")
      .withIndex("by_team_a", (q) => q.eq("teamAId", teamId))
      .collect();
    const bMatches = await ctx.db
      .query("matches")
      .withIndex("by_team_b", (q) => q.eq("teamBId", teamId))
      .collect();

    const matches = [...aMatches, ...bMatches].sort(
      (a, b) => b.startTime - a.startTime,
    );
    const opponentIds = new Set<Id<"teams">>();
    for (const m of matches) {
      opponentIds.add(m.teamAId === teamId ? m.teamBId : m.teamAId);
    }
    const opponents = new Map(
      (await Promise.all([...opponentIds].map((id) => ctx.db.get(id))))
        .filter((t) => t !== null)
        .map((t) => [t!._id, t!]),
    );

    // ---- analytics across this team's completed innings --------------------
    const completed = matches.filter((m) => m.status === "COMPLETED");
    const inningsRows = [];
    for (const m of completed) {
      const inns = await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .collect();
      for (const inn of inns) {
        if (inn.battingTeamId !== teamId) continue;
        const ds = await ctx.db
          .query("deliveries")
          .withIndex("by_innings", (q) => q.eq("inningsId", inn._id))
          .collect();
        inningsRows.push({
          matchId: m._id,
          totalRuns: inn.totalRuns,
          wickets: inn.wickets,
          balls: inn.ballsBowled,
          overs: m.overs,
          deliveries: ds,
        });
      }
    }
    let wins = 0;
    let losses = 0;
    let ties = 0;
    for (const m of completed) {
      const r = m.result ?? "";
      const tied = r.includes("tied");
      const won = !tied && /won/i.test(r) && !r.includes(team.name);
      if (tied) ties += 1;
      else if (won) wins += 1;
      else losses += 1;
    }
    const totals = inningsRows.map((i) => {
      const phase = (start: number, end: number) => {
        let idx = 0;
        let sum = 0;
        for (const d of i.deliveries) {
          if (isLegalBall(d.extraType)) {
            if (idx >= start && idx < end) sum += d.totalRuns;
            idx += 1;
          }
        }
        return sum;
      };
      const total = i.deliveries.reduce((s, d) => s + d.totalRuns, 0);
      const pp = Math.floor(i.overs * 6 * 0.3);
      const death = Math.floor(i.overs * 6 * 0.8);
      return { total, balls: i.balls, powerplay: phase(0, pp), middle: phase(pp, death), death: phase(death, i.overs * 6) };
    });
    const avg = (fn: (t: typeof totals[number]) => number) =>
      totals.length > 0
        ? Number((totals.reduce((s, t) => s + fn(t), 0) / totals.length).toFixed(1))
        : 0;
    const highest = totals.length > 0 ? Math.max(...totals.map((t) => t.total)) : 0;
    const lowest = totals.length > 0 ? Math.min(...totals.map((t) => t.total)) : 0;
    const avgWickets =
      inningsRows.length > 0
        ? Number((inningsRows.reduce((s, i) => s + i.wickets, 0) / inningsRows.length).toFixed(1))
        : 0;
    const runRateAll = totals.length > 0
      ? Number(
          (totals.reduce((s, t) => s + t.total, 0) /
            (totals.reduce((s, t) => s + Math.max(1, t.balls), 0) / 6)).toFixed(2),
        )
      : 0;

    const playingXI = players.filter((p) => p.isPlayingXI);
    const bench = players.filter((p) => !p.isPlayingXI);
    const captain = players.find((p) => p.isCaptain) ?? null;

    return {
      team,
      tournament,
      captain: captain ? { _id: captain._id, name: captain.name } : null,
      coach: team.coach ?? null,
      players: players.sort((a, b) => a.name.localeCompare(b.name)),
      playingXI: playingXI.sort((a, b) => a.name.localeCompare(b.name)),
      bench: bench.sort((a, b) => a.name.localeCompare(b.name)),
      matches: matches.map((m) => ({
        id: m._id,
        status: m.status,
        startTime: m.startTime,
        stage: m.stage,
        result: m.result,
        opponent: opponents.get(m.teamAId === teamId ? m.teamBId : m.teamAId) ?? null,
      })),
      analytics: {
        played: completed.length,
        wins,
        losses,
        ties,
        winPct: completed.length > 0 ? Number(((wins / completed.length) * 100).toFixed(1)) : 0,
        highest,
        lowest,
        avgScore: avg((t) => t.total),
        avgPowerplay: avg((t) => t.powerplay),
        avgMiddle: avg((t) => t.middle),
        avgDeath: avg((t) => t.death),
        avgWickets,
        runRate: runRateAll,
      },
    };
  },
});

/** Organizer: fix mistyped team details (name, code, colors, coach). */
export const update = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.optional(v.string()),
    shortCode: v.optional(v.string()),
    color: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    coach: v.optional(v.string()),
    captainId: v.optional(v.id("players")),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found.");
    await requireOrganizer(ctx, team.tournamentId);
    await ctx.db.patch(args.teamId, {
      name: args.name ?? team.name,
      shortCode: args.shortCode ? args.shortCode.toUpperCase().slice(0, 4) : team.shortCode,
      color: args.color ?? team.color,
      logoUrl: args.logoUrl !== undefined ? args.logoUrl : team.logoUrl,
      coach: args.coach !== undefined ? args.coach : team.coach,
      captainId: args.captainId !== undefined ? args.captainId : team.captainId,
    });
    return args.teamId;
  },
});

/** Organizer: create a team under a specific tournament. */
export const create = mutation({
  args: {
    name: v.string(),
    shortCode: v.string(),
    color: v.string(),
    logoUrl: v.optional(v.string()),
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found.");
    await requireOrganizer(ctx, args.tournamentId);
    return await ctx.db.insert("teams", {
      tournamentId: args.tournamentId,
      name: args.name,
      shortCode: args.shortCode.toUpperCase().slice(0, 4),
      color: args.color,
      logoUrl: args.logoUrl,
    });
  },
});
