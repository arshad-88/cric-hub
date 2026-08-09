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
} as const;

export const playerRoleValidator = v.union(
  v.literal(PLAYER_ROLE.BATSMAN),
  v.literal(PLAYER_ROLE.BOWLER),
  v.literal(PLAYER_ROLE.ALL_ROUNDER),
);
export type PlayerRole = Infer<typeof playerRoleValidator>;

export const WICKET_TYPE = {
  BOWLED: "Bowled",
  CAUGHT: "Caught",
  RUN_OUT: "Run out",
  STUMPED: "Stumped",
  LBW: "LBW",
} as const;

export const wicketTypeValidator = v.union(
  v.literal(WICKET_TYPE.BOWLED),
  v.literal(WICKET_TYPE.CAUGHT),
  v.literal(WICKET_TYPE.RUN_OUT),
  v.literal(WICKET_TYPE.STUMPED),
  v.literal(WICKET_TYPE.LBW),
);
export type WicketType = Infer<typeof wicketTypeValidator>;

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
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ------------------------------------------------------------------
    // VPL CricHub domain tables
    // ------------------------------------------------------------------

    // tournaments (id, name, year, description)
    tournaments: defineTable({
      name: v.string(),
      year: v.number(),
      description: v.optional(v.string()),
      active: v.boolean(), // the active tournament powers the public pages
    }).index("by_active", ["active"]),

    // teams (id, tournament_id, team_name, logo_url)
    teams: defineTable({
      tournamentId: v.id("tournaments"),
      name: v.string(),
      shortCode: v.string(), // e.g. "VW"
      color: v.string(), // hex accent for identity blocks
    }).index("by_tournament", ["tournamentId"]),

    // players (id, team_id, name, role)
    players: defineTable({
      teamId: v.id("teams"),
      name: v.string(),
      role: playerRoleValidator,
    }).index("by_team", ["teamId"]),

    // matches (id, tournament_id, team_a_id, team_b_id, status, toss, overs, stream_url)
    matches: defineTable({
      tournamentId: v.id("tournaments"),
      teamAId: v.id("teams"),
      teamBId: v.id("teams"),
      status: matchStatusValidator,
      tossWinnerId: v.optional(v.id("teams")),
      tossDecision: v.optional(tossDecisionValidator),
      overs: v.number(), // overs per innings (T20 = 20)
      venue: v.optional(v.string()),
      stage: v.optional(matchStageValidator),
      startTime: v.number(), // epoch ms
      streamUrl: v.optional(v.string()), // YouTube URL/ID or Twitch URL
      currentInningsId: v.optional(v.id("innings")),
      result: v.optional(v.string()), // computed result line once completed
    })
      .index("by_tournament_status", ["tournamentId", "status"])
      .index("by_status", ["status"])
      .index("by_team_a", ["teamAId"])
      .index("by_team_b", ["teamBId"]),

    // innings (id, match_id, batting_team_id, bowling_team_id, totals)
    innings: defineTable({
      matchId: v.id("matches"),
      number: v.number(), // 1 or 2
      battingTeamId: v.id("teams"),
      bowlingTeamId: v.id("teams"),
      totalRuns: v.number(),
      wickets: v.number(),
      ballsBowled: v.number(), // legal balls (overs*6 + balls-in-current-over)
      target: v.optional(v.number()), // set on the chasing innings
      // live crease state
      openingStrikerId: v.optional(v.id("players")),
      openingNonStrikerId: v.optional(v.id("players")),
      strikerId: v.optional(v.id("players")),
      nonStrikerId: v.optional(v.id("players")),
      currentBowlerId: v.optional(v.id("players")),
    }).index("by_match", ["matchId"]),

    // deliveries (id, match_id, innings_id, over_number, ball_number, ...)
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
    })
      .index("by_innings", ["inningsId"])
      .index("by_match", ["matchId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
