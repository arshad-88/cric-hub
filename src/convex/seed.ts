// ---------------------------------------------------------------------------
// seed.ts — deterministic demo bootstrap for the CricPulse platform.
// Run:  bunx convex run seed:run
// Wipes the domain tables and creates three tournaments:
//   1. Vasavi Premier League 2026  (Grace ball, ACTIVE — 8 teams, completed
//      group games, a LIVE final with stream URL, upcoming semis)
//   2. Krishna Valley Cup 2026     (Tennis ball, UPCOMING — 4 teams, fixtures)
//   3. Coastal Village Championship 2025 (Leather, PAST — 4 teams, completed)
// Safe to run repeatedly — it always starts from a clean slate.
// ---------------------------------------------------------------------------

import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { buildCommentary, computeMatchResult, isLegalBall, replayCrease } from "./cricket";
import { EXTRA_TYPE, WICKET_TYPE } from "./schema";
import type { ExtraType, PlayerRole, WicketType } from "./schema";
import type { MutationCtx } from "./_generated/server";

// deterministic RNG so the demo data is stable
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface SquadPlayer {
  id: Id<"players">;
  name: string;
  role: PlayerRole;
}

const BATTING_STYLES = ["Right-hand bat", "Left-hand bat"];
const BOWLING_STYLES = [
  "Right-arm fast medium",
  "Right-arm off spin",
  "Leg spin",
  "Left-arm orthodox",
  "Left-arm medium fast",
];

interface TeamSeed {
  name: string;
  shortCode: string;
  color: string;
  players: string[];
}

const ACTIVE_TEAMS: TeamSeed[] = [
  { name: "Vasavi Warriors", shortCode: "VW", color: "#22c55e", players: ["Ravi Kumar", "Suresh Reddy", "Manoj Yadav", "Kiran Rao", "Anil Naik", "Vijay Patel", "Srinivas Goud", "Praveen Shetty", "Naveen Babu", "Rajesh Varma"] },
  { name: "Premiere Strikers", shortCode: "PS", color: "#22d3ee", players: ["Arjun Mehta", "Karthik Rao", "Deepak Sharma", "Harsha Vardhan", "Lokesh Teja", "Mohan Krishna", "Naresh Kumar", "Pavan Kalyan", "Raghu Ram", "Sai Charan"] },
  { name: "Village Titans", shortCode: "VT", color: "#a78bfa", players: ["Balaji Naidu", "Chandra Shekar", "Dinesh Kumar", "Ganesh Babu", "Harish Rao", "Jagan Mohan", "Lakshman Rao", "Mahesh Goud", "Nagesh Reddy", "Prasad Varma"] },
  { name: "Sunrise XI", shortCode: "SX", color: "#facc15", players: ["Rakesh Yadav", "Santosh Kumar", "Teja Swaroop", "Uday Kiran", "Vamsi Krishna", "Yashwanth", "Aditya Verma", "Bharath Teja", "Chaitanya", "Dhanush Reddy"] },
  { name: "Krishna Kings", shortCode: "KK", color: "#34d399", players: ["Eswar Rao", "Farhan Khan", "Goutham Kumar", "Hemanth", "Ishaan Sheikh", "Jeevan Reddy", "Kalyan Babu", "Lohith Kumar", "Manikanta", "Nikhil Teja"] },
  { name: "Godavari Giants", shortCode: "GG", color: "#f472b6", players: ["Om Prakash", "Pradeep Kumar", "Quasim Ali", "Ramesh Babu", "Sandeep Yadav", "Tarun Teja", "Umesh Chandra", "Varun Raj", "Yogi Prasad", "Zubair Ahmed"] },
  { name: "Sai Smashers", shortCode: "SS", color: "#fb923c", players: ["Abdul Rahim", "Bhaskar Rao", "Charan Teja", "Devendra", "Eknath Reddy", "Girish Kumar", "Hari Prasad", "Imran Khan", "Jai Shankar", "Kishore Babu"] },
  { name: "Deccan Dynamos", shortCode: "DD", color: "#60a5fa", players: ["Laxman Teja", "Murali Krishna", "Narasimha Rao", "Omkar Yadav", "Prakash Goud", "Rohit Sharma", "Siddharth", "Trinadh Reddy", "Venkat Rao", "Wilson Kumar"] },
];

const CUP_TEAMS: TeamSeed[] = [
  { name: "Warangal Wolves", shortCode: "WW", color: "#f87171", players: ["Karthik Rao", "Pranay Kumar", "Vikram Reddy", "Sai Teja", "Mohan Rao", "Jai Kumar"] },
  { name: "Hanamkonda Hawks", shortCode: "HH", color: "#4ade80", players: ["Nikhil Varma", "Rohan Shetty", "Aditya Rao", "Pavan Kumar", "Suresh Goud", "Lokesh Naik"] },
  { name: "Kazipet Kings", shortCode: "KZ", color: "#38bdf8", players: ["Arun Reddy", "Deepak Varma", "Harsha Rao", "Kiran Kumar", "Manoj Goud", "Ravi Teja"] },
  { name: "Kakatiya Cubs", shortCode: "KC", color: "#fbbf24", players: ["Sandeep Rao", "Tarun Kumar", "Uday Reddy", "Vamsi Goud", "Yash Naik", "Zeeshan Ali"] },
];

const COAST_TEAMS: TeamSeed[] = [
  { name: "Nellore Navigators", shortCode: "NN", color: "#2dd4bf", players: ["Bharat Rao", "Charan Kumar", "Dinesh Naik", "Gopal Reddy", "Hari Varma"] },
  { name: "Kavali Kings", shortCode: "KV", color: "#facc15", players: ["Jai Ram", "Kiran Naidu", "Lokesh Reddy", "Murali Rao", "Naveen Kumar"] },
  { name: "Gudur Giants", shortCode: "GG", color: "#fb7185", players: ["Om Prakash", "Ravi Teja", "Sai Kumar", "Trinadh Rao", "Umesh Naik"] },
  { name: "Venkatagiri Vipers", shortCode: "VV", color: "#a78bfa", players: ["Vinod Rao", "Yogi Kumar", "Zaid Khan", "Adarsh Reddy", "Balu Naik"] },
];

const ROLES_CYCLE: PlayerRole[] = [
  "Batsman", "Batsman", "Batsman", "Batsman", "All-rounder",
  "All-rounder", "Bowler", "Bowler", "Bowler", "Bowler",
];

const OVERS = 20;
const DAY = 24 * 60 * 60 * 1000;

interface SimOutcome {
  runsScored: number;
  extraType: ExtraType;
  extraRuns: number;
  isWicket: boolean;
  wicketType?: WicketType;
  dismissedBatterId?: Id<"players">;
  fielderId?: Id<"players">;
}

function rollOutcome(
  rand: () => number,
  bowlingSquad: SquadPlayer[],
  striker: SquadPlayer,
): SimOutcome {
  const r = rand();
  const wicketType = (): SimOutcome["wicketType"] => {
    const w = rand();
    if (w < 0.45) return WICKET_TYPE.CAUGHT;
    if (w < 0.72) return WICKET_TYPE.BOWLED;
    if (w < 0.88) return WICKET_TYPE.LBW;
    return WICKET_TYPE.STUMPED;
  };
  const randomFielder = (): Id<"players"> | undefined => {
    const others = bowlingSquad.filter((p) => p.id !== striker.id);
    return others[Math.floor(rand() * others.length)]?.id;
  };

  if (r < 0.4) return { runsScored: 0, extraType: EXTRA_TYPE.NONE, extraRuns: 0, isWicket: false };
  if (r < 0.67) return { runsScored: 1, extraType: EXTRA_TYPE.NONE, extraRuns: 0, isWicket: false };
  if (r < 0.77) return { runsScored: 2, extraType: EXTRA_TYPE.NONE, extraRuns: 0, isWicket: false };
  if (r < 0.79) return { runsScored: 3, extraType: EXTRA_TYPE.NONE, extraRuns: 0, isWicket: false };
  if (r < 0.88) return { runsScored: 4, extraType: EXTRA_TYPE.NONE, extraRuns: 0, isWicket: false };
  if (r < 0.93) return { runsScored: 6, extraType: EXTRA_TYPE.NONE, extraRuns: 0, isWicket: false };
  if (r < 0.955) {
    return {
      runsScored: 0, extraType: EXTRA_TYPE.NONE, extraRuns: 0, isWicket: true,
      wicketType: wicketType(), dismissedBatterId: striker.id,
      fielderId: randomFielder(),
    };
  }
  if (r < 0.975) {
    return { runsScored: 0, extraType: EXTRA_TYPE.WIDE, extraRuns: 1 + Math.floor(rand() * 2), isWicket: false };
  }
  if (r < 0.985) {
    const batRuns = rand() < 0.6 ? 0 : rand() < 0.8 ? 1 : 2;
    return { runsScored: batRuns, extraType: EXTRA_TYPE.NOBALL, extraRuns: 1, isWicket: false };
  }
  if (r < 0.99) {
    return { runsScored: 0, extraType: EXTRA_TYPE.BYE, extraRuns: 1 + Math.floor(rand() * 3), isWicket: false };
  }
  return { runsScored: 0, extraType: EXTRA_TYPE.LEGBYE, extraRuns: 1 + Math.floor(rand() * 2), isWicket: false };
}

interface SimResult {
  inningsId: Id<"innings">;
  battingTeamId: Id<"teams">;
  totalRuns: number;
  wickets: number;
  ballsBowled: number;
  target?: number;
}

async function simulateInnings(
  ctx: MutationCtx,
  matchId: Id<"matches">,
  inningsNumber: number,
  battingTeamId: Id<"teams">,
  bowlingTeamId: Id<"teams">,
  battingSquad: SquadPlayer[],
  bowlingSquad: SquadPlayer[],
  target: number | null,
  rand: () => number,
  opts: { maxBalls?: number } = {},
): Promise<SimResult> {
  const inningsId = await ctx.db.insert("innings", {
    matchId,
    number: inningsNumber,
    battingTeamId,
    bowlingTeamId,
    totalRuns: 0,
    wickets: 0,
    ballsBowled: 0,
    target: target ?? undefined,
    openingStrikerId: undefined,
    openingNonStrikerId: undefined,
    strikerId: undefined,
    nonStrikerId: undefined,
    currentBowlerId: undefined,
  });

  const order = shuffle(battingSquad, rand);
  const queue = [...order];
  const striker = queue.shift()!;
  const nonStriker = queue.shift()!;

  const bowlersPool = [...bowlingSquad].sort(
    (a, b) =>
      (a.role === "Bowler" ? 0 : a.role === "All-rounder" ? 1 : 2) -
        (b.role === "Bowler" ? 0 : b.role === "All-rounder" ? 1 : 2) ||
      rand() - 0.5,
  );
  let bowlerIdx = 0;
  let currentBowler = bowlersPool[0];

  let totalRuns = 0;
  let wickets = 0;
  let ballsBowled = 0;
  let overNumber = 1;
  let ballsInOver = 0;
  let strikerId = striker.id;
  let nonStrikerId = nonStriker.id;

  const deliveryDocs: {
    bowlerId: Id<"players">;
    batsmanId: Id<"players">;
    nonStrikerId: Id<"players">;
    overNumber: number;
    ballNumber: number;
    runsScored: number;
    extraType: ExtraType;
    extraRuns: number;
    totalRuns: number;
    isWicket: boolean;
    wicketType?: WicketType;
    dismissedBatterId?: Id<"players">;
    fielderId?: Id<"players">;
    newBatsmanId?: Id<"players">;
    commentary: string;
  }[] = [];

  while (true) {
    const outcome = rollOutcome(rand, bowlingSquad, striker);
    const legal = isLegalBall(outcome.extraType);
    const ballNumber = ballsInOver + 1;
    const totalBallRuns = outcome.runsScored + outcome.extraRuns;

    let newBatsman: SquadPlayer | undefined;
    if (outcome.isWicket) {
      newBatsman = queue.shift();
    }

    const commentary = buildCommentary(
      {
        overNumber,
        ballNumber,
        bowlerId: currentBowler.id,
        batsmanId: striker.id,
        runsScored: outcome.runsScored,
        extraType: outcome.extraType,
        extraRuns: outcome.extraRuns,
        totalRuns: totalBallRuns,
        isWicket: outcome.isWicket,
        wicketType: outcome.wicketType,
        dismissedBatterId: outcome.dismissedBatterId,
        fielderId: outcome.fielderId,
        newBatsmanId: newBatsman?.id,
      },
      {
        bowler: currentBowler.name,
        batsman: striker.name,
        dismissed: striker.name,
        fielder: bowlingSquad.find((p) => p.id === outcome.fielderId)?.name,
      },
    );

    deliveryDocs.push({
      bowlerId: currentBowler.id,
      batsmanId: striker.id,
      nonStrikerId,
      overNumber,
      ballNumber,
      runsScored: outcome.runsScored,
      extraType: outcome.extraType,
      extraRuns: outcome.extraRuns,
      totalRuns: totalBallRuns,
      isWicket: outcome.isWicket,
      wicketType: outcome.wicketType,
      dismissedBatterId: outcome.dismissedBatterId,
      fielderId: outcome.fielderId,
      newBatsmanId: newBatsman?.id,
      commentary,
    });

    totalRuns += totalBallRuns;
    if (legal) {
      ballsBowled += 1;
      ballsInOver += 1;
    }
    if (outcome.isWicket) wickets += 1;

    const rotateBy =
      outcome.runsScored +
      (outcome.extraType === EXTRA_TYPE.BYE || outcome.extraType === EXTRA_TYPE.LEGBYE
        ? outcome.extraRuns
        : 0);
    if (rotateBy % 2 === 1) {
      const t = strikerId;
      strikerId = nonStrikerId;
      nonStrikerId = t;
    }
    if (outcome.isWicket && newBatsman) {
      strikerId = newBatsman.id;
    }
    const findPlayer = (id: Id<"players">) =>
      battingSquad.find((p) => p.id === id) ?? striker;
    const s = findPlayer(strikerId);
    const ns = findPlayer(nonStrikerId);
    striker.name = s.name;
    striker.id = s.id;
    nonStriker.name = ns.name;
    nonStriker.id = ns.id;

    if (ballsInOver === 6) {
      ballsInOver = 0;
      overNumber += 1;
      bowlerIdx += 1;
      currentBowler = bowlersPool[bowlerIdx % bowlersPool.length];
      const t = strikerId;
      strikerId = nonStrikerId;
      nonStrikerId = t;
      const s2 = findPlayer(strikerId);
      const ns2 = findPlayer(nonStrikerId);
      striker.name = s2.name;
      striker.id = s2.id;
      nonStriker.name = ns2.name;
      nonStriker.id = ns2.id;
    }

    const inningsDone =
      wickets >= 10 ||
      ballsBowled >= OVERS * 6 ||
      (target != null && totalRuns >= target);
    if (inningsDone) break;
    if (opts.maxBalls != null && ballsBowled >= opts.maxBalls) break;
  }

  for (const d of deliveryDocs) {
    await ctx.db.insert("deliveries", { ...d, matchId, inningsId });
  }

  const crease = replayCrease(
    deliveryDocs.map((d) => ({
      overNumber: d.overNumber,
      ballNumber: d.ballNumber,
      bowlerId: d.bowlerId,
      batsmanId: d.batsmanId,
      runsScored: d.runsScored,
      extraType: d.extraType,
      extraRuns: d.extraRuns,
      totalRuns: d.totalRuns,
      isWicket: d.isWicket,
      newBatsmanId: d.newBatsmanId,
    })),
    order[0]?.id,
    order[1]?.id,
  );

  await ctx.db.patch(inningsId, {
    totalRuns,
    wickets,
    ballsBowled,
    openingStrikerId: order[0]?.id,
    openingNonStrikerId: order[1]?.id,
    strikerId: crease.strikerId,
    nonStrikerId: crease.nonStrikerId,
    currentBowlerId: currentBowler.id,
  });

  return {
    inningsId,
    battingTeamId,
    totalRuns,
    wickets,
    ballsBowled,
    target: target ?? undefined,
  };
}

/** Wipe every domain table (keeps auth users intact). */
export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    for (const table of ["deliveries", "innings", "matches", "players", "teams", "tournaments"] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    return { ok: true };
  },
});

/** Wipe + create the three demo tournaments. */
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const rand = mulberry32(20260809);
    const now = Date.now();

    for (const table of ["deliveries", "innings", "matches", "players", "teams", "tournaments"] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }

    async function createTournament(
      name: string,
      year: number,
      opts: {
        city?: string;
        ballType?: "Grace Ball" | "Leather" | "Tennis";
        description?: string;
        startDate?: number;
        endDate?: number;
        bannerUrl?: string;
        active?: boolean;
      },
    ) {
      return await ctx.db.insert("tournaments", {
        name,
        year,
        description: opts.description,
        city: opts.city,
        ballType: opts.ballType,
        startDate: opts.startDate,
        endDate: opts.endDate,
        bannerUrl: opts.bannerUrl,
        active: opts.active ?? false,
      });
    }

    async function createTeams(
      tournamentId: Id<"tournaments">,
      seeds: TeamSeed[],
    ): Promise<{ teamIds: Map<string, Id<"teams">>; squads: Map<string, SquadPlayer[]> }> {
      const teamIds = new Map<string, Id<"teams">>();
      const squads = new Map<string, SquadPlayer[]>();
      for (const t of seeds) {
        const teamId = await ctx.db.insert("teams", {
          tournamentId,
          name: t.name,
          shortCode: t.shortCode,
          color: t.color,
          logoUrl: undefined,
        });
        teamIds.set(t.name, teamId);
        const squad: SquadPlayer[] = t.players.map((name, i) => ({
          id: `placeholder-${name}` as Id<"players">,
          name,
          role: ROLES_CYCLE[i % ROLES_CYCLE.length],
        }));
        squads.set(t.name, squad);
      }
      for (const t of seeds) {
        const teamId = teamIds.get(t.name)!;
        const squad = squads.get(t.name)!;
        for (let i = 0; i < squad.length; i++) {
          const pid = await ctx.db.insert("players", {
            teamId,
            name: squad[i].name,
            role: squad[i].role,
            battingStyle: BATTING_STYLES[i % BATTING_STYLES.length],
            bowlingStyle:
              squad[i].role === "Batsman"
                ? undefined
                : BOWLING_STYLES[i % BOWLING_STYLES.length],
            jerseyNumber: i + 1,
          });
          squad[i] = { ...squad[i], id: pid };
        }
      }
      return { teamIds, squads };
    }

    // ===================================================================
    // 1) ACTIVE — Vasavi Premier League 2026 (Grace ball)
    // ===================================================================
    const vplId = await createTournament("Vasavi Premier League", 2026, {
      city: "Peddapalli, Telangana",
      ballType: "Grace Ball",
      description:
        "Twelve village clubs, one trophy. Every match broadcast live with ball-by-ball scoring.",
      startDate: now - 14 * DAY,
      endDate: now + 14 * DAY,
      active: true,
    });
    const vpl = await createTeams(vplId, ACTIVE_TEAMS);

    const groupGames: [string, string][] = [
      ["Vasavi Warriors", "Premiere Strikers"],
      ["Village Titans", "Sunrise XI"],
      ["Krishna Kings", "Godavari Giants"],
      ["Sai Smashers", "Deccan Dynamos"],
    ];
    for (let i = 0; i < groupGames.length; i++) {
      const [a, b] = groupGames[i];
      const matchId = await ctx.db.insert("matches", {
        tournamentId: vplId,
        teamAId: vpl.teamIds.get(a)!,
        teamBId: vpl.teamIds.get(b)!,
        status: "LIVE",
        overs: OVERS,
        venue: i % 2 === 0 ? "Vasavi Ground, Peddapalli" : "NTR Stadium, Hanamkonda",
        stage: "Group",
        startTime: now - (5 - i) * DAY,
        streamUrl: undefined,
        currentInningsId: undefined,
        result: undefined,
      });
      const in1 = await simulateInnings(
        ctx, matchId, 1, vpl.teamIds.get(a)!, vpl.teamIds.get(b)!,
        vpl.squads.get(a)!, vpl.squads.get(b)!, null, rand,
      );
      const in2 = await simulateInnings(
        ctx, matchId, 2, vpl.teamIds.get(b)!, vpl.teamIds.get(a)!,
        vpl.squads.get(b)!, vpl.squads.get(a)!, in1.totalRuns + 1, rand,
      );
      const result = computeMatchResult({ batting1: a, batting2: b }, in1, in2);
      await ctx.db.patch(matchId, {
        status: "COMPLETED",
        currentInningsId: in2.inningsId,
        result: result ?? undefined,
      });
    }

    const liveMatchId = await ctx.db.insert("matches", {
      tournamentId: vplId,
      teamAId: vpl.teamIds.get("Vasavi Warriors")!,
      teamBId: vpl.teamIds.get("Premiere Strikers")!,
      status: "LIVE",
      overs: OVERS,
      venue: "Vasavi Ground, Peddapalli",
      stage: "Final",
      startTime: now - 2 * 60 * 60 * 1000,
      streamUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      currentInningsId: undefined,
      result: undefined,
    });
    const liveIn1 = await simulateInnings(
      ctx, liveMatchId, 1, vpl.teamIds.get("Vasavi Warriors")!, vpl.teamIds.get("Premiere Strikers")!,
      vpl.squads.get("Vasavi Warriors")!, vpl.squads.get("Premiere Strikers")!, null, rand,
    );
    const liveIn2 = await simulateInnings(
      ctx, liveMatchId, 2, vpl.teamIds.get("Premiere Strikers")!, vpl.teamIds.get("Vasavi Warriors")!,
      vpl.squads.get("Premiere Strikers")!, vpl.squads.get("Vasavi Warriors")!,
      liveIn1.totalRuns + 1, rand, { maxBalls: 49 },
    );
    await ctx.db.patch(liveMatchId, {
      status: "LIVE",
      currentInningsId: liveIn2.inningsId,
    });

    const semis: [string, string, number][] = [
      ["Village Titans", "Sai Smashers", 2],
      ["Sunrise XI", "Deccan Dynamos", 4],
    ];
    for (const [a, b, daysOut] of semis) {
      await ctx.db.insert("matches", {
        tournamentId: vplId,
        teamAId: vpl.teamIds.get(a)!,
        teamBId: vpl.teamIds.get(b)!,
        status: "UPCOMING",
        overs: OVERS,
        venue: "Vasavi Ground, Peddapalli",
        stage: "Semi-final",
        startTime: now + daysOut * DAY,
        streamUrl: undefined,
        currentInningsId: undefined,
        result: undefined,
      });
    }

    // ===================================================================
    // 2) UPCOMING — Krishna Valley Cup 2026 (Tennis ball)
    // ===================================================================
    const cupId = await createTournament("Krishna Valley Cup", 2026, {
      city: "Warangal, Telangana",
      ballType: "Tennis",
      description:
        "Fast-paced tennis-ball cricket under the lights. Four clubs battle for the valley crown.",
      startDate: now + 10 * DAY,
      endDate: now + 24 * DAY,
    });
    const cup = await createTeams(cupId, CUP_TEAMS);
    const cupFixtures: [string, string, number][] = [
      ["Warangal Wolves", "Kazipet Kings", 10],
      ["Hanamkonda Hawks", "Kakatiya Cubs", 12],
      ["Warangal Wolves", "Kakatiya Cubs", 16],
    ];
    for (const [a, b, daysOut] of cupFixtures) {
      await ctx.db.insert("matches", {
        tournamentId: cupId,
        teamAId: cup.teamIds.get(a)!,
        teamBId: cup.teamIds.get(b)!,
        status: "UPCOMING",
        overs: 10,
        venue: "Kakatiya Stadium, Warangal",
        stage: "Group",
        startTime: now + daysOut * DAY,
        streamUrl: undefined,
        currentInningsId: undefined,
        result: undefined,
      });
    }

    // ===================================================================
    // 3) PAST — Coastal Village Championship 2025 (Leather ball)
    // ===================================================================
    const coastId = await createTournament("Coastal Village Championship", 2025, {
      city: "Nellore, Andhra Pradesh",
      ballType: "Leather",
      description:
        "Leather-ball cricket along the coast — last year's champions crowned under the lights.",
      startDate: now - 90 * DAY,
      endDate: now - 30 * DAY,
    });
    const coast = await createTeams(coastId, COAST_TEAMS);
    const coastGames: [string, string][] = [
      ["Nellore Navigators", "Kavali Kings"],
      ["Gudur Giants", "Venkatagiri Vipers"],
    ];
    for (let i = 0; i < coastGames.length; i++) {
      const [a, b] = coastGames[i];
      const matchId = await ctx.db.insert("matches", {
        tournamentId: coastId,
        teamAId: coast.teamIds.get(a)!,
        teamBId: coast.teamIds.get(b)!,
        status: "LIVE",
        overs: OVERS,
        venue: "Coastal Stadium, Nellore",
        stage: "Group",
        startTime: now - (80 - i * 10) * DAY,
        streamUrl: undefined,
        currentInningsId: undefined,
        result: undefined,
      });
      const in1 = await simulateInnings(
        ctx, matchId, 1, coast.teamIds.get(a)!, coast.teamIds.get(b)!,
        coast.squads.get(a)!, coast.squads.get(b)!, null, rand,
      );
      const in2 = await simulateInnings(
        ctx, matchId, 2, coast.teamIds.get(b)!, coast.teamIds.get(a)!,
        coast.squads.get(b)!, coast.squads.get(a)!, in1.totalRuns + 1, rand,
      );
      const result = computeMatchResult({ batting1: a, batting2: b }, in1, in2);
      await ctx.db.patch(matchId, {
        status: "COMPLETED",
        currentInningsId: in2.inningsId,
        result: result ?? undefined,
      });
    }

    return {
      seeded: true,
      tournaments: 3,
      teams: ACTIVE_TEAMS.length + CUP_TEAMS.length + COAST_TEAMS.length,
      liveMatchId,
    };
  },
});
