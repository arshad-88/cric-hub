/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auction from "../auction.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as career from "../career.js";
import type * as cricket from "../cricket.js";
import type * as emails from "../emails.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as iplCatalog from "../iplCatalog.js";
import type * as leaderboard from "../leaderboard.js";
import type * as matches from "../matches.js";
import type * as mvp from "../mvp.js";
import type * as notifications from "../notifications.js";
import type * as notificationsPush from "../notificationsPush.js";
import type * as players from "../players.js";
import type * as scheduler from "../scheduler.js";
import type * as scorecard from "../scorecard.js";
import type * as scoring from "../scoring.js";
import type * as seed from "../seed.js";
import type * as simulate from "../simulate.js";
import type * as teams from "../teams.js";
import type * as tournaments from "../tournaments.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auction: typeof auction;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  career: typeof career;
  cricket: typeof cricket;
  emails: typeof emails;
  helpers: typeof helpers;
  http: typeof http;
  iplCatalog: typeof iplCatalog;
  leaderboard: typeof leaderboard;
  matches: typeof matches;
  mvp: typeof mvp;
  notifications: typeof notifications;
  notificationsPush: typeof notificationsPush;
  players: typeof players;
  scheduler: typeof scheduler;
  scorecard: typeof scorecard;
  scoring: typeof scoring;
  seed: typeof seed;
  simulate: typeof simulate;
  teams: typeof teams;
  tournaments: typeof tournaments;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
