import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// ---------------------------------------------------------------------------
// Domain constants — mirror of the requested PostgreSQL schema enums
// ---------------------------------------------------------------------------

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const MATCH_STATUS = {
  UPCOMING: "UPCOMING",
  LIVE: "LIVE",
  COMPLETED: "COMPLETED",
} as const;

export const matchStatusValidator = v.union(
  v.literal(MATCH_STATUS.UPCOMING),
  v.literal(MATCH_STATUS.LIVE),
  v.literal(MATCH_STATUS.COMPLETED),
);
export type MatchStatus = Infer<typeof matchStatusValidator>;

export const PLAYER_ROLE = {
  BATSMAN: "Batsman",
  BOWLER: "Bowler",
  ALL_ROUNDER: "All-rounder",
  WICKETKEEPER: "Wicketkeeper",
} as const;

export const playerRoleValidator = v.union(
  v.literal(PLAYER_ROLE.BATSMAN),
  v.literal(PLAYER_ROLE.BOWLER),
  v.literal(PLAYER_ROLE.ALL_ROUNDER),
  v.literal(PLAYER_ROLE.WICKETKEEPER),
);
export type PlayerRole = Infer<typeof playerRoleValidator>;

export const WICKET_TYPE = {
  BOWLED: "Bowled",
  CAUGHT: "Caught",
  RUN_OUT: "Run out",
  STUMPED: "Stumped",
  LBW: "LBW",
  HIT_WICKET: "Hit wicket",
  OBSTRUCTING: "Obstructing the field",
  TIMED_OUT: "Timed out",
  RETIRED_HURT: "Retired hurt",
  RETIRED_OUT: "Retired out",
} as const;

export const wicketTypeValidator = v.union(
  v.literal(WICKET_TYPE.BOWLED),
  v.literal(WICKET_TYPE.CAUGHT),
  v.literal(WICKET_TYPE.RUN_OUT),
  v.literal(WICKET_TYPE.STUMPED),
  v.literal(WICKET_TYPE.LBW),
  v.literal(WICKET_TYPE.HIT_WICKET),
  v.literal(WICKET_TYPE.OBSTRUCTING),
  v.literal(WICKET_TYPE.TIMED_OUT),
  v.literal(WICKET_TYPE.RETIRED_HURT),
  v.literal(WICKET_TYPE.RETIRED_OUT),
);
export type WicketType = Infer<typeof wicketTypeValidator>;

/** Whether a wicket type means the batter can return to the crease (retired hurt). */
export function isReturnableDismissal(t: WicketType): boolean {
  return t === WICKET_TYPE.RETIRED_HURT;
}

export const EXTRA_TYPE = {
  NONE: "none",
  WIDE: "wide",
  NOBALL: "noball",
  BYE: "bye",
  LEGBYE: "legbye",
} as const;

export const extraTypeValidator = v.union(
  v.literal(EXTRA_TYPE.NONE),
  v.literal(EXTRA_TYPE.WIDE),
  v.literal(EXTRA_TYPE.NOBALL),
  v.literal(EXTRA_TYPE.BYE),
  v.literal(EXTRA_TYPE.LEGBYE),
);
export type ExtraType = Infer<typeof extraTypeValidator>;

export const TOSS_DECISION = {
  BAT: "bat",
  BOWL: "bowl",
} as const;

export const tossDecisionValidator = v.union(
  v.literal(TOSS_DECISION.BAT),
  v.literal(TOSS_DECISION.BOWL),
);
export type TossDecision = Infer<typeof tossDecisionValidator>;

export const MATCH_STAGE = {
  GROUP: "Group",
  QUARTER: "Quarter-final",
  SEMI: "Semi-final",
  FINAL: "Final",
} as const;

export const matchStageValidator = v.union(
  v.literal(MATCH_STAGE.GROUP),
  v.literal(MATCH_STAGE.QUARTER),
  v.literal(MATCH_STAGE.SEMI),
  v.literal(MATCH_STAGE.FINAL),
);
export type MatchStage = Infer<typeof matchStageValidator>;

// ball types used across tournaments

export const BALL_TYPE = {
  GRACE: "Grace Ball",
  LEATHER: "Leather",
  TENNIS: "Tennis",
} as const;

export const ballTypeValidator = v.union(
  v.literal(BALL_TYPE.GRACE),
  v.literal(BALL_TYPE.LEATHER),
  v.literal(BALL_TYPE.TENNIS),
);
export type BallType = Infer<typeof ballTypeValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
      phone: v.optional(v.string()), // canonical phone number — the login handle
    })
      .index("email", ["email"]) // index for the email. do not remove or modify
      .index("by_phone", ["phone"]), // phone sign-in + roster autofill lookups

    // ------------------------------------------------------------------
    // CricPulse domain tables
    // ------------------------------------------------------------------

    // tournaments — the platform hosts many of these (directory is public).
    // `organizers` holds the users allowed to edit/score it; the creator is
    // always the first entry and can add co-organizers by phone.
    tournaments: defineTable({
      name: v.string(),
      year: v.number(),
      description: v.optional(v.string()),
      city: v.optional(v.string()),
      ballType: v.optional(ballTypeValidator),
      startDate: v.optional(v.number()), // epoch ms
      endDate: v.optional(v.number()),
      bannerUrl: v.optional(v.string()),
      defaultOvers: v.optional(v.number()), // default overs per match
      active: v.boolean(), // the featured tournament on the landing page
      organizers: v.array(v.id("users")), // who may edit/score (creator first)
    }).index("by_active", ["active"]),

    // teams (id, tournament_id, team_name, logo_url)
    teams: defineTable({
      tournamentId: v.id("tournaments"),
      name: v.string(),
      shortCode: v.string(), // e.g. "VW"
      color: v.string(), // hex accent for identity blocks
      logoUrl: v.optional(v.string()),
      coach: v.optional(v.string()), // team coach / mentor name
      captainId: v.optional(v.id("players")), // the captain (also part of the XI)
    }).index("by_tournament", ["tournamentId"]),

    // players (id, team_id, name, phone, role, styles, jersey). `phone` lets
    // organizers pull a player's details straight from their account.
    players: defineTable({
      teamId: v.id("teams"),
      name: v.string(),
      phone: v.optional(v.string()), // matches the account phone (auto-fill source)
      role: playerRoleValidator,
      battingStyle: v.optional(v.string()), // e.g. "Right-hand bat"
      bowlingStyle: v.optional(v.string()), // e.g. "Right-arm off spin"
      jerseyNumber: v.optional(v.number()),
      isPlayingXI: v.optional(v.boolean()), // selected for the match-day eleven
      isCaptain: v.optional(v.boolean()), // captain badge (also in the XI)
      isViceCaptain: v.optional(v.boolean()), // vice-captain badge
    }).index("by_team", ["teamId"]),

    // matches (id, tournament_id, team_a_id, team_b_id, status, toss, overs, stream_url)
    matches: defineTable({
      tournamentId: v.id("tournaments"),
      teamAId: v.id("teams"),
      teamBId: v.id("teams"),
      status: matchStatusValidator,
      tossWinnerId: v.optional(v.id("teams")),
      tossDecision: v.optional(tossDecisionValidator),
      teamAXI: v.optional(v.array(v.id("players"))), // scorer-picked playing XI (11) for team A
      teamBXI: v.optional(v.array(v.id("players"))), // scorer-picked playing XI (11) for team B
      overs: v.number(), // overs per innings (T20 = 20)
      venue: v.optional(v.string()),
      stage: v.optional(matchStageValidator),
      startTime: v.number(), // epoch ms
      streamUrl: v.optional(v.string()), // YouTube URL/ID or Twitch URL
      currentInningsId: v.optional(v.id("innings")),
      result: v.optional(v.string()), // computed result line once completed
      superOver: v.optional(v.boolean()), // tied → one-over eliminator in progress
    })
      .index("by_tournament_status", ["tournamentId", "status"])
      .index("by_status", ["status"])
      .index("by_team_a", ["teamAId"])
      .index("by_team_b", ["teamBId"]),

    // innings (id, match_id, batting_team_id, bowling_team_id, totals)
    innings: defineTable({
      matchId: v.id("matches"),
      number: v.number(), // 1, 2 — or 3, 4 for a super over
      battingTeamId: v.id("teams"),
      bowlingTeamId: v.id("teams"),
      totalRuns: v.number(),
      wickets: v.number(),
      ballsBowled: v.number(), // legal balls (overs*6 + balls-in-current-over)
      target: v.optional(v.number()), // set on the chasing innings
      isSuperOver: v.optional(v.boolean()), // true for innings 3/4 (1 over, 2 wkts)
      // live crease state
      openingStrikerId: v.optional(v.id("players")),
      openingNonStrikerId: v.optional(v.id("players")),
      strikerId: v.optional(v.id("players")),
      nonStrikerId: v.optional(v.id("players")),
      currentBowlerId: v.optional(v.id("players")),
    }).index("by_match", ["matchId"]),

    // ------------------------------------------------------------------
    // Auction tables — entertainment layer (real IPL + local custom auctions)
    // ------------------------------------------------------------------

    // auctions — a multiplayer auction room. `pool` is a snapshot of the
    // players up for bidding; the room advances through it as the auctioneer
    // calls players. Live bid state (currentBid / currentBidderTeamId /
    // bidEndsAt) is written on every bid so all joined phones react together.
    auctions: defineTable({
      mode: v.union(v.literal("ipl"), v.literal("custom")),
      title: v.string(),
      hostId: v.id("users"),
      hostName: v.string(),
      tournamentId: v.optional(v.id("tournaments")), // custom mode source
      purse: v.number(), // starting purse per team, in lakhs
      squadSize: v.number(),
      status: v.union(v.literal("SETUP"), v.literal("LIVE"), v.literal("COMPLETED")),
      roomCode: v.string(), // 6-digit join code
      pool: v.array(
        v.object({
          key: v.string(),
          name: v.string(),
          role: v.string(), // Batter / All-rounder / Wicketkeeper / Bowler
          basePrice: v.number(), // lakhs
          photoUrl: v.optional(v.string()),
          wiki: v.optional(v.string()), // Wikipedia title → photo lookup
          teamShort: v.optional(v.string()), // IPL franchise or local team code
          career: v.optional(
            v.object({
              matches: v.number(),
              runs: v.number(),
              wickets: v.number(),
              sr: v.number(),
              econ: v.number(),
            }),
          ),
          form: v.optional(
            v.object({
              matches: v.number(),
              runs: v.number(),
              wickets: v.number(),
              sr: v.number(),
              econ: v.number(),
            }),
          ),
          nationality: v.optional(v.union(v.literal("IND"), v.literal("OS"))),
        }),
      ),
      // live auction state
      currentIndex: v.optional(v.number()),
      currentBid: v.optional(v.number()),
      currentBidderTeamId: v.optional(v.id("auctionTeams")),
      bidEndsAt: v.optional(v.number()),
      soldCount: v.number(),
      // squad constraint config (validated on every bid / SOLD)
      maxOverseas: v.optional(v.number()),
      minWicketkeepers: v.optional(v.number()),
      minBowlers: v.optional(v.number()),
      minAllRounders: v.optional(v.number()),
      // host mode switch: AUTO runs the whole auction from a server cron
      // (calls players, sells when the clock runs out, moves on); MANUAL
      // leaves it to the auctioneer.
      autoPilot: v.optional(v.boolean()),
      updatedAt: v.number(),
    })
      .index("by_room_code", ["roomCode"])
      .index("by_status", ["status"]),

    // auctionTeams — every joined friend is one franchise in the room.
    auctionTeams: defineTable({
      auctionId: v.id("auctions"),
      ownerId: v.id("users"),
      name: v.string(),
      color: v.string(),
      purseRemaining: v.number(),
      sold: v.array(
        v.object({
          playerKey: v.string(),
          name: v.string(),
          role: v.string(),
          price: v.number(),
          photoUrl: v.optional(v.string()),
          wiki: v.optional(v.string()),
          teamShort: v.optional(v.string()),
          nationality: v.optional(v.union(v.literal("IND"), v.literal("OS"))),
          career: v.optional(
            v.object({
              matches: v.number(),
              runs: v.number(),
              wickets: v.number(),
              sr: v.number(),
              econ: v.number(),
            }),
          ),
          form: v.optional(
            v.object({
              matches: v.number(),
              runs: v.number(),
              wickets: v.number(),
              sr: v.number(),
              econ: v.number(),
            }),
          ),
        }),
      ),
    }).index("by_auction", ["auctionId"]),

    // deliveries (id, match_id, innings_id, over_number, ball_number, ...)
    // ------------------------------------------------------------------
    // Live match events — the source for in-app web alerts, browser
    // notifications and web push (wickets, milestones, results, super over).
    // ------------------------------------------------------------------
    matchEvents: defineTable({
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
    }).index("by_match", ["matchId"]), // _creationTime is auto-appended

    // Web Push subscriptions (service worker push for followed matches).
    pushSubscriptions: defineTable({
      endpoint: v.string(),
      auth: v.string(),
      p256dh: v.string(),
      userId: v.optional(v.id("users")),
    })
      .index("by_endpoint", ["endpoint"])
      .index("by_user", ["userId"]),

    // Signed-in users following a match → push target for that match's events.
    matchFollows: defineTable({
      userId: v.id("users"),
      matchId: v.id("matches"),
    })
      .index("by_user_match", ["userId", "matchId"])
      .index("by_match", ["matchId"])
      .index("by_user", ["userId"]),

    // Key/value app settings (e.g. generated VAPID keypair for web push).
    settings: defineTable({
      key: v.string(),
      value: v.string(),
    }).index("by_key", ["key"]),

    deliveries: defineTable({
      matchId: v.id("matches"),
      inningsId: v.id("innings"),
      overNumber: v.number(), // 1-based
      ballNumber: v.number(), // legal-ball position within the over, 1-based
      bowlerId: v.id("players"),
      batsmanId: v.id("players"), // striker facing the ball
      nonStrikerId: v.optional(v.id("players")),
      runsScored: v.number(), // runs credited to the batsman
      extraType: extraTypeValidator,
      extraRuns: v.number(), // penalty (wide 1+, noball 1) or byes/leg-byes
      totalRuns: v.number(), // added to team total = runsScored + extraRuns
      isWicket: v.boolean(),
      wicketType: v.optional(wicketTypeValidator),
      dismissedBatterId: v.optional(v.id("players")),
      fielderId: v.optional(v.id("players")),
      newBatsmanId: v.optional(v.id("players")), // replacement at the crease
      commentary: v.string(), // pre-rendered ball-by-ball text
      // shot placement recorded by the scorer for scoring shots (wagon wheel).
      // One of: cover, mid-off, long-on, midwicket, fine-leg, third-man,
      // square-leg, deep-midwicket, long-off, point, extra-cover, straight
      shotRegion: v.optional(v.string()),
      // shot type recorded with the region (drive, cut, pull, sweep, lofted…)
      shotType: v.optional(v.string()),
    })
      .index("by_innings", ["inningsId"])
      .index("by_match", ["matchId"]),

    // Manual points overrides — lets the organizer edit a team's points table
    // entry (points, wins, losses, etc.) without modifying match data.
    pointsOverrides: defineTable({
      tournamentId: v.id("tournaments"),
      teamId: v.id("teams"),
      played: v.optional(v.number()),
      won: v.optional(v.number()),
      lost: v.optional(v.number()),
      tied: v.optional(v.number()),
      points: v.optional(v.number()),
      nrr: v.optional(v.number()),
    }).index("by_tournament_team", ["tournamentId", "teamId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
