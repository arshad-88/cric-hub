// ---------------------------------------------------------------------------
// seed.ts — demo tournament bootstrap for VPL CricHub.
// Run once:  bunx convex run seed:run
// Creates the VPL 2026 tournament, 8 village squads, 4 completed group games,
// 1 LIVE final (with stream URL + ~8 overs bowled in the chase) and 2 upcoming
// semi-finals. Idempotent — safe to run repeatedly.
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

const TEAMS = [
  { name: "Vasavi Warriors", shortCode: "VW", color: "#E4002B" },
  { name: "Premiere Strikers", shortCode: "PS", color: "#002FA7" },
  { name: "Village Titans", shortCode: "VT", color: "#141414" },
  { name: "Sunrise XI", shortCode: "SX", color: "#F5A800" },
  { name: "Krishna Kings", shortCode: "KK", color: "#00843D" },
  { name: "Godavari Giants", shortCode: "GG", color: "#7B2CBF" },
  { name: "Sai Smashers", shortCode: "SS", color: "#F37021" },
  { name: "Deccan Dynamos", shortCode: "DD", color: "#007C91" },
];

const SQUADS: Record<string, string[]> = {
  "Vasavi Warriors": [
    "Ravi Kumar", "Suresh Reddy", "Manoj Yadav", "Kiran Rao", "Anil Naik",
    "Vijay Patel", "Srinivas Goud", "Praveen Shetty", "Naveen Babu", "Rajesh Varma",
  ],
  "Premiere Strikers": [
    "Arjun Mehta", "Karthik Rao", "Deepak Sharma", "Harsha Vardhan", "Lokesh Teja",
    "Mohan Krishna", "Naresh Kumar", "Pavan Kalyan", "Raghu Ram", "Sai Charan",
  ],
  "Village Titans": [
    "Balaji Naidu", "Chandra Shekar", "Dinesh Kumar", "Ganesh Babu", "Harish Rao",
    "Jagan Mohan", "Lakshman Rao", "Mahesh Goud", "Nagesh Reddy", "Prasad Varma",
  ],
  "Sunrise XI": [
    "Rakesh Yadav", "Santosh Kumar", "Teja Swaroop", "Uday Kiran", "Vamsi Krishna",
    "Yashwanth", "Aditya Verma", "Bharath Teja", "Chaitanya", "Dhanush Reddy",
  ],
  "Krishna Kings": [
    "Eswar Rao", "Farhan Khan", "Goutham Kumar", "Hemanth", "Ishaan Sheikh",
    "Jeevan Reddy", "Kalyan Babu", "Lohith Kumar", "Manikanta", "Nikhil Teja",
  ],
  "Godavari Giants": [
    "Om Prakash", "Pradeep Kumar", "Quasim Ali", "Ramesh Babu", "Sandeep Yadav",
    "Tarun Teja", "Umesh Chandra", "Varun Raj", "Yogi Prasad", "Zubair Ahmed",
  ],
  "Sai Smashers": [
    "Abdul Rahim", "Bhaskar Rao", "Charan Teja", "Devendra", "Eknath Reddy",
    "Girish Kumar", "Hari Prasad", "Imran Khan", "Jai Shankar", "Kishore Babu",
  ],
  "Deccan Dynamos": [
    "Laxman Teja", "Murali Krishna", "Narasimha Rao", "Omkar Yadav", "Prakash Goud",
    "Rohit Sharma", "Siddharth", "Trinadh Reddy", "Venkat Rao", "Wilson Kumar",
  ],
};

const ROLES_CYCLE: PlayerRole[] = [
  "Batsman", "Batsman", "Batsman", "Batsman", "All-rounder",
  "All-rounder", "Bowler", "Bowler", "Bowler", "Bowler",
];

const OVERS = 20;

interface SimOutcome {
  runsScored: number;
  extraType: ExtraType;
  extraRuns: number;
  isWicket: boolean;
  wicketType?: "Bowled" | "Caught" | "Run out" | "Stumped" | "LBW";
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

    // strike rotation
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
    // update local crease objects
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

export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("tournaments")
      .filter((q) => q.eq(q.field("name"), "VPL 2026"))
      .first();
    if (existing) {
      return { seeded: false, message: "VPL 2026 already exists — seed skipped." };
    }
    const rand = mulberry32(20260809);

    const tournamentId = await ctx.db.insert("tournaments", {
      name: "VPL 2026",
      year: 2026,
      description:
        "Vasavi Premiere League — twelve village clubs, one trophy. Follow every ball live.",
      active: true,
    });

    const teamIds = new Map<string, Id<"teams">>();
    const squads = new Map<string, SquadPlayer[]>();
    for (const t of TEAMS) {
      const teamId = await ctx.db.insert("teams", {
        tournamentId,
        name: t.name,
        shortCode: t.shortCode,
        color: t.color,
      });
      teamIds.set(t.name, teamId);
      const names = SQUADS[t.name];
      const squad: SquadPlayer[] = [];
      names.forEach((name, i) => {
        squad.push({ id: `seed-${t.shortCode}-${i}` as Id<"players">, name, role: ROLES_CYCLE[i % ROLES_CYCLE.length] });
      });
      squads.set(t.name, squad);
    }
    // insert players for real ids
    for (const t of TEAMS) {
      const teamId = teamIds.get(t.name)!;
      const squad = squads.get(t.name)!;
      for (let i = 0; i < squad.length; i++) {
        const pid = await ctx.db.insert("players", {
          teamId,
          name: squad[i].name,
          role: squad[i].role,
        });
        squad[i] = { ...squad[i], id: pid };
      }
    }

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // ---- 4 completed group games ------------------------------------------
    const groupGames: [string, string][] = [
      ["Vasavi Warriors", "Premiere Strikers"],
      ["Village Titans", "Sunrise XI"],
      ["Krishna Kings", "Godavari Giants"],
      ["Sai Smashers", "Deccan Dynamos"],
    ];
    for (let i = 0; i < groupGames.length; i++) {
      const [a, b] = groupGames[i];
      const matchId = await ctx.db.insert("matches", {
        tournamentId,
        teamAId: teamIds.get(a)!,
        teamBId: teamIds.get(b)!,
        status: "LIVE",
        overs: OVERS,
        venue: i % 2 === 0 ? "Vasavi Ground, Peddapalli" : "NTR Stadium, Hanamkonda",
        stage: "Group",
        startTime: now - (4 - i) * day,
        streamUrl: undefined,
        currentInningsId: undefined,
        result: undefined,
      });
      const in1 = await simulateInnings(
        ctx, matchId, 1, teamIds.get(a)!, teamIds.get(b)!,
        squads.get(a)!, squads.get(b)!, null, rand,
      );
      const in2 = await simulateInnings(
        ctx, matchId, 2, teamIds.get(b)!, teamIds.get(a)!,
        squads.get(b)!, squads.get(a)!, in1.totalRuns + 1, rand,
      );
      const result = computeMatchResult({ batting1: a, batting2: b }, in1, in2);
      await ctx.db.patch(matchId, {
        status: "COMPLETED",
        currentInningsId: in2.inningsId,
        result: result ?? undefined,
      });
    }

    // ---- LIVE final --------------------------------------------------------
    const liveMatchId = await ctx.db.insert("matches", {
      tournamentId,
      teamAId: teamIds.get("Vasavi Warriors")!,
      teamBId: teamIds.get("Premiere Strikers")!,
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
      ctx, liveMatchId, 1, teamIds.get("Vasavi Warriors")!, teamIds.get("Premiere Strikers")!,
      squads.get("Vasavi Warriors")!, squads.get("Premiere Strikers")!, null, rand,
    );
    const liveIn2 = await simulateInnings(
      ctx, liveMatchId, 2, teamIds.get("Premiere Strikers")!, teamIds.get("Vasavi Warriors")!,
      squads.get("Premiere Strikers")!, squads.get("Vasavi Warriors")!,
      liveIn1.totalRuns + 1, rand, { maxBalls: 49 },
    );
    await ctx.db.patch(liveMatchId, {
      status: "LIVE",
      currentInningsId: liveIn2.inningsId,
    });

    // ---- 2 upcoming semi-finals --------------------------------------------
    const semis: [string, string, number][] = [
      ["Village Titans", "Sai Smashers", 2],
      ["Sunrise XI", "Deccan Dynamos", 4],
    ];
    for (const [a, b, daysOut] of semis) {
      await ctx.db.insert("matches", {
        tournamentId,
        teamAId: teamIds.get(a)!,
        teamBId: teamIds.get(b)!,
        status: "UPCOMING",
        overs: OVERS,
        venue: "Vasavi Ground, Peddapalli",
        stage: "Semi-final",
        startTime: now + daysOut * day,
        streamUrl: undefined,
        currentInningsId: undefined,
        result: undefined,
      });
    }

    return { seeded: true, tournamentId };
  },
});
