// ---------------------------------------------------------------------------
// vpl.ts — client-side domain types + Swiss-style formatting helpers
// ---------------------------------------------------------------------------

export interface TeamLite {
  _id: string;
  name: string;
  shortCode: string;
  color: string;
}

export type BallKind = "dot" | "runs" | "boundary" | "wicket" | "extra" | "bye" | "wide";

export interface BallView {
  key: string;
  overLabel: string;
  symbol: string;
  kind: BallKind;
  text: string;
  isWicket: boolean;
}

export interface BatterView {
  playerId: string;
  name: string;
  role: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  sr: number;
  status: "batting" | "out" | "notOut";
  dismissalText: string | null;
  isStriker: boolean;
  isNonStriker: boolean;
}

export interface BowlerView {
  playerId: string;
  name: string;
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  econ: number;
}

export interface OverView {
  over: number;
  runs: number;
  wickets: number;
  legalBalls: number;
  balls: { symbol: string; kind: BallKind }[];
}

export interface InningsView {
  id: string;
  number: number;
  battingTeam: TeamLite;
  bowlingTeam: TeamLite;
  totalRuns: number;
  wickets: number;
  ballsBowled: number;
  oversLabel: string;
  target: number | null;
  striker: { _id: string; name: string } | null;
  nonStriker: { _id: string; name: string } | null;
  bowler: { _id: string; name: string } | null;
  batters: BatterView[];
  bowlers: BowlerView[];
  recentBalls: BallView[];
  commentary: BallView[];
  overs: OverView[];
  extras: { total: number; wide: number; noball: number; bye: number; legbye: number };
  isCurrent: boolean;
  isComplete: boolean;
  crr: number;
  rrr: number | null;
}

export interface Scorecard {
  match: {
    id: string;
    status: "UPCOMING" | "LIVE" | "COMPLETED";
    overs: number;
    venue?: string;
    stage?: string;
    startTime: number;
    streamUrl?: string;
    result?: string;
    tossWinnerId?: string;
    tossDecision?: "bat" | "bowl";
    currentInningsId?: string;
  };
  tournament: { id: string; name: string; year: number };
  teamA: TeamLite;
  teamB: TeamLite;
  innings: InningsView[];
  currentInningsId: string | null;
  currentInnings: InningsView | null;
  result: string | null;
  live: boolean;
}

export type TournamentStatus = "ACTIVE" | "UPCOMING" | "PAST";

export interface TournamentLite {
  id: string;
  name: string;
  year: number;
  description?: string;
  city?: string;
  ballType?: string;
  startDate?: number;
  endDate?: number;
  bannerUrl?: string;
  active: boolean;
  status: TournamentStatus;
  teamsCount: number;
  matchesCount: number;
  completedCount: number;
  liveMatchId?: string;
}

export interface MatchRow {
  id: string;
  status: "UPCOMING" | "LIVE" | "COMPLETED";
  overs: number;
  venue?: string;
  stage?: string;
  startTime: number;
  streamUrl?: string;
  result?: string;
  inningsSummary?: string | null;
  teamA?: TeamLite | null;
  teamB?: TeamLite | null;
}

export interface PointsRow {
  team: TeamLite;
  played: number;
  won: number;
  lost: number;
  tied: number;
  points: number;
  nrr: number;
}

export interface Leaderboard {
  tournament: { id: string; name: string; year: number };
  pointsTable: PointsRow[];
  topBatters: {
    playerId: string;
    name: string;
    team: TeamLite | null;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    sr: number;
    innings: number;
  }[];
  topBowlers: {
    playerId: string;
    name: string;
    team: TeamLite | null;
    wickets: number;
    runs: number;
    balls: number;
    overs: string;
    maidens: number;
    econ: number;
  }[];
}

// ---- overs & rates ---------------------------------------------------------

export function formatOvers(balls: number): string {
  const completed = Math.floor(balls / 6);
  const rem = balls % 6;
  return `${completed}.${rem}`;
}

export function runRate(runs: number, balls: number): number {
  if (balls <= 0) return 0;
  return Number((runs / (balls / 6)).toFixed(2));
}

// ---- dates -----------------------------------------------------------------

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---- stream parsing ---------------------------------------------------------

export function parseYouTubeId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/live\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/,
    /^([\w-]{11})$/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  return null;
}

export function isTwitchUrl(url: string): boolean {
  return /twitch\.tv\//.test(url);
}

export function twitchChannel(url: string): string | null {
  const m = url.trim().match(/twitch\.tv\/([\w_]+)/);
  return m ? m[1] : null;
}

// ---- status -----------------------------------------------------------------

export function statusLabel(status: string): string {
  if (status === "LIVE") return "LIVE";
  if (status === "UPCOMING") return "UPCOMING";
  return "COMPLETED";
}
