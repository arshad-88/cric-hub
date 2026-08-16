import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { InningsPanel, inningsLabel } from "@/components/InningsPanel";
import { WinPredictor } from "@/components/WinPredictor";
import { CommentaryFeed } from "@/components/CommentaryFeed";
import { StreamEmbed } from "@/components/StreamEmbed";
import { PointsTable } from "@/components/PointsTable";
import { PlayerLink } from "@/components/PlayerLink";
import { ManhattanChart, WagonWheel } from "@/components/MatchCharts";
import { BallChip, MicroLabel, StatusPill, TeamMark } from "@/components/swiss";
import { ScorePopupStage } from "@/components/ScorePopupStage";
import { useScorePopups } from "@/hooks/use-score-popups";
import { formatDate, formatTime, type InningsView } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  Calendar,
  Clapperboard,
  MapPin,
  Trophy,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Id } from "@/convex/_generated/dataModel";

type TabKey = "scorecard" | "overs" | "analytics" | "commentary" | "xi" | "points" | "caps";

const TABS: { key: TabKey; label: string }[] = [
  { key: "scorecard", label: "Scorecard" },
  { key: "overs", label: "Overs" },
  { key: "analytics", label: "Analytics" },
  { key: "commentary", label: "Commentary" },
  { key: "xi", label: "Playing XI" },
  { key: "points", label: "Points" },
  { key: "caps", label: "Caps" },
];

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("scorecard");
  const scorecard = useQuery(api.scorecard.get, id ? { matchId: id as Id<"matches"> } : "skip");
  const follows = useQuery(api.notifications.myFollows);
  const followMatch = useMutation(api.notifications.followMatch);
  const unfollowMatch = useMutation(api.notifications.unfollowMatch);
  const isFollowing = follows ? follows.includes(id ?? "") : false;
  const events = useQuery(
    api.notifications.listForMatch,
    id ? { matchId: id as Id<"matches"> } : "skip",
  );

  const teamASquad = useQuery(
    api.players.listByTeam,
    scorecard ? { teamId: scorecard.teamA._id as Id<"teams"> } : "skip",
  );
  const teamBSquad = useQuery(
    api.players.listByTeam,
    scorecard ? { teamId: scorecard.teamB._id as Id<"teams"> } : "skip",
  );
  const leaderboard = useQuery(
    api.leaderboard.get,
    scorecard ? { tournamentId: scorecard.tournament.id as Id<"tournaments"> } : "skip",
  );
  const mvp = useQuery(
    api.mvp.getMatch,
    scorecard && scorecard.match.status === "COMPLETED"
      ? { matchId: scorecard.match.id as Id<"matches"> }
      : "skip",
  );

  // Live popups need the batting/bowling squads of the CURRENT innings (the
  // toss may have sent either team in first).
  const battingSquad =
    scorecard?.currentInnings && scorecard.currentInnings.battingTeam._id === scorecard.teamA._id
      ? (teamASquad ?? [])
      : (teamBSquad ?? []);
  const bowlingSquad =
    scorecard?.currentInnings && scorecard.currentInnings.battingTeam._id === scorecard.teamA._id
      ? (teamBSquad ?? [])
      : (teamASquad ?? []);
  const popups = useScorePopups(scorecard, battingSquad, bowlingSquad, events ?? []);

  if (scorecard === undefined) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-20">
          <div className="h-10 w-10 animate-spin border-2 border-[#22c55e] border-t-transparent" />
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (scorecard === null) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-20">
          <p className="border border-border bg-card px-4 py-14 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
            Match not found
          </p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const { match, teamA, teamB, innings, live, result, currentInnings } = scorecard;
  const toss =
    match.tossWinnerId && match.tossDecision
      ? `${match.tossWinnerId === teamA._id ? teamA.name : teamB.name} won the toss and chose to ${match.tossDecision}`
      : null;

  // A team's score is the innings where that team batted — never assume team A
  // batted first (the toss may send team B in).
  const scoreFor = (teamId: string) =>
    innings.find((i) => i.battingTeam._id === teamId) ?? null;
  const teamAScore = scoreFor(teamA._id);
  const teamBScore = scoreFor(teamB._id);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ScorePopupStage popups={popups} />
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        {/* ===== match header / stadium scoreboard ===== */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MicroLabel className="text-[#22d3ee]">
                {match.stage ?? "Match"} · {match.overs} overs
              </MicroLabel>
              <StatusPill status={match.status} />
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              <Calendar className="size-3.5" />
              {formatDate(match.startTime)} · {formatTime(match.startTime)}
              {match.venue && (
                <>
                  <span className="text-slate-700">|</span>
                  <MapPin className="size-3.5" />
                  {match.venue}
                </>
              )}
            </div>
          </div>

          <div className="stadium-gradient mt-4 grid gap-4 border border-border px-4 py-5 panel-glow sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3 sm:px-6 sm:py-6">
            <div className="flex items-center gap-3">
              <TeamMark shortCode={teamA.shortCode} color={teamA.color} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-black uppercase tracking-tight text-white">
                  {teamA.name}
                </p>
                {teamAScore && (
                  <p className="score-nums text-3xl font-black text-white led-green">
                    {teamAScore.totalRuns}/{teamAScore.wickets}
                    <span className="ml-1.5 text-sm font-bold text-slate-400">
                      ({teamAScore.oversLabel})
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="hidden text-center sm:block">
              <span className="micro-label text-slate-500">vs</span>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4 text-right sm:border-t-0 sm:pt-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-black uppercase tracking-tight text-white">
                  {teamB.name}
                </p>
                {teamBScore && (
                  <p className="score-nums text-3xl font-black text-white led-green">
                    {teamBScore.totalRuns}/{teamBScore.wickets}
                    <span className="ml-1.5 text-sm font-bold text-slate-400">
                      ({teamBScore.oversLabel})
                    </span>
                  </p>
                )}
              </div>
              <TeamMark shortCode={teamB.shortCode} color={teamB.color} size="lg" />
            </div>
          </div>

          {result && (
            <p className="mt-3 border-l-4 border-[#22c55e] bg-[#22c55e]/[0.08] px-4 py-2.5 text-sm font-black uppercase tracking-wide text-[#22c55e]">
              {result}
            </p>
          )}
          {match.superOver && !result && (
            <p className="mt-3 flex items-center gap-2 border-l-4 border-[#facc15] bg-[#422006]/50 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-[#facc15]">
              <Zap className="size-4" /> Match tied — Super Over underway
            </p>
          )}
          {toss && (
            <p className="mt-3 text-[11px] font-medium uppercase tracking-widest text-slate-500">
              Toss — {toss}
            </p>
          )}

          {/* outcome predictor + follow */}
          <div className="mt-4">
            <WinPredictor
              prediction={scorecard.prediction}
              teamA={teamA}
              teamB={teamB}
              status={match.status}
              superOver={match.superOver}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <FollowMatchButton
              matchId={match.id}
              isFollowing={isFollowing}
              onToggle={async () => {
                try {
                  if (isFollowing) {
                    await unfollowMatch({ matchId: match.id as Id<"matches"> });
                    toast.success("Unfollowed — no more alerts for this match.");
                  } else {
                    await followMatch({ matchId: match.id as Id<"matches"> });
                    toast.success("Following — get push alerts for every key moment.");
                  }
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "";
                  if (/sign in/i.test(msg)) {
                    navigate("/auth?returnTo=" + encodeURIComponent(`/matches/${match.id}`));
                  } else {
                    toast.error(msg || "Could not update follow state.");
                  }
                }
              }}
            />
          </div>
        </motion.div>

        {/* ===== tabs ===== */}
        <div className="mt-8 flex items-center gap-1 overflow-x-auto border-b-2 border-border pb-px">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "micro-label shrink-0 border-b-2 px-4 py-2.5 transition-colors",
                tab === t.key
                  ? "border-[#22c55e] bg-[#22c55e]/[0.08] text-[#22c55e]"
                  : "border-transparent text-slate-500 hover:text-white",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ===== tab panels ===== */}
        <div className="mt-6">
          {tab === "scorecard" && (
            <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
              <div className="space-y-6">
                {mvp && mvp.top.length > 0 && (
                  <PlayerOfTheMatch top={mvp.top} winnerTeamId={mvp.winnerTeamId} />
                )}
                <div>
                  <MicroLabel className="mb-2 block">Scorecard</MicroLabel>
                  {innings.length === 0 ? (
                    <div className="border border-border bg-card px-4 py-12 text-center panel-glow">
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                        {match.status === "UPCOMING"
                          ? "Toss yet to happen — check back at match time"
                          : "Scorecard coming soon"}
                      </p>
                    </div>
                  ) : (
                    innings.map((inn) => (
                      <div key={inn.id} className="mb-4 last:mb-0">
                        <InningsPanel innings={inn} active={live && inn.isCurrent} />
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <MicroLabel className="mb-2 flex items-center gap-1.5">
                    <Clapperboard className="size-3.5" /> Live stream
                  </MicroLabel>
                  <StreamEmbed url={match.streamUrl ?? null} />
                </div>
                <div>
                  <MicroLabel className="mb-2 block">Ball-by-ball</MicroLabel>
                  <CommentaryFeed balls={currentInnings?.commentary.slice(0, 10) ?? []} />
                </div>
              </div>
            </div>
          )}

          {tab === "overs" && (
            <OversTab innings={innings} live={live} />
          )}

          {tab === "analytics" && <AnalyticsTab innings={innings} />}

          {tab === "commentary" && (
            <div className="mx-auto max-w-2xl">
              <MicroLabel className="mb-2 block">Full commentary</MicroLabel>
              <CommentaryFeed balls={currentInnings?.commentary ?? []} />
            </div>
          )}

          {tab === "xi" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <XIPanel
                name={teamA.name}
                shortCode={teamA.shortCode}
                color={teamA.color}
                squad={teamASquad ?? []}
                xi={match.teamAXI}
              />
              <XIPanel
                name={teamB.name}
                shortCode={teamB.shortCode}
                color={teamB.color}
                squad={teamBSquad ?? []}
                xi={match.teamBXI}
              />
            </div>
          )}

          {tab === "points" && (
            <div className="mx-auto max-w-3xl">
              <MicroLabel className="mb-2 block text-[#facc15]">
                {scorecard.tournament.name} — points table
              </MicroLabel>
              <PointsTable rows={leaderboard?.pointsTable ?? []} />
            </div>
          )}

          {tab === "caps" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <CapPanel
                title="Orange cap · Run leaders"
                tone="gold"
                rows={(leaderboard?.topBatters ?? []).map((b) => ({
                  key: b.playerId,
                  name: b.name,
                  team: b.team?.name ?? "—",
                  value: b.runs,
                }))}
              />
              <CapPanel
                title="Purple cap · Wicket takers"
                tone="cyan"
                rows={(leaderboard?.topBowlers ?? []).map((b) => ({
                  key: b.playerId,
                  name: b.name,
                  team: b.team?.name ?? "—",
                  value: b.wickets,
                }))}
              />
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

// ---- tab panels ------------------------------------------------------------

function OversTab({ innings, live }: { innings: InningsView[]; live: boolean }) {
  if (innings.length === 0) {
    return (
      <p className="border border-border bg-card px-4 py-12 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
        Overs will appear as the match progresses
      </p>
    );
  }
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {innings.map((inn) => (
        <div key={inn.id} className="border border-border bg-card panel-glow">
          <div
            className={cn(
              "flex items-center justify-between border-b border-border px-3 py-2",
              live && inn.isCurrent ? "bg-[#052e16]" : "bg-panel",
            )}
          >
            <span className="flex items-center gap-2">
              <TeamMark shortCode={inn.battingTeam.shortCode} color={inn.battingTeam.color} size="sm" />
              <span className="text-xs font-extrabold uppercase tracking-wide text-white">
                {inningsLabel(inn.number)}
              </span>
            </span>
            <span className="score-nums text-sm font-black text-white">
              {inn.totalRuns}/{inn.wickets}
            </span>
          </div>
          <ul className="divide-y divide-border/60">
            {inn.overs.length === 0 && (
              <li className="px-3 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                No overs bowled
              </li>
            )}
            {inn.overs.map((o) => (
              <li key={o.over} className="flex items-center gap-3 px-3 py-2">
                <span className="score-nums w-10 shrink-0 text-xs font-black text-slate-400">
                  Over {o.over}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  {o.balls.map((b, i) => (
                    <BallChip key={i} symbol={b.symbol} kind={b.kind} size="sm" />
                  ))}
                </span>
                <span
                  className={cn(
                    "score-nums shrink-0 text-right text-xs font-black",
                    o.wickets > 0 ? "text-[#ef4444]" : o.runs >= 12 ? "text-[#22c55e]" : "text-slate-200",
                  )}
                >
                  {o.runs}/{o.wickets}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function XIPanel({
  name,
  shortCode,
  color,
  squad,
  xi,
}: {
  name: string;
  shortCode: string;
  color: string;
  squad: { _id: string; name: string; role: string; battingStyle?: string; bowlingStyle?: string; jerseyNumber?: number }[];
  xi?: string[];
}) {
  // When the scorer has locked in the match XI, only those 11 are shown;
  // otherwise the full squad is listed (matches without a saved XI).
  const inXI = xi && xi.length > 0 ? new Set(xi.map((id) => String(id))) : null;
  const rows = inXI ? squad.filter((p) => inXI.has(String(p._id))) : squad;
  return (
    <div className="border border-border bg-card panel-glow">
      <div className="flex items-center gap-2.5 border-b border-border bg-panel px-3 py-2.5">
        <TeamMark shortCode={shortCode} color={color} size="sm" />
        <span className="truncate text-sm font-extrabold uppercase tracking-tight text-white">
          {name}
        </span>
        <span className="micro-label ml-auto text-slate-500">
          {inXI ? `XI · ${rows.length}` : `Squad · ${squad.length}`}
        </span>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((p) => (
          <li key={p._id} className="flex items-center gap-3 px-3 py-2">
            <span className="score-nums w-6 shrink-0 text-center text-[10px] font-black text-slate-500">
              {p.jerseyNumber ?? "—"}
            </span>
            <span className="min-w-0 flex-1">
              <PlayerLink id={p._id} name={p.name} className="block truncate text-sm font-bold text-slate-100">
                {p.name}
              </PlayerLink>
              <span className="block truncate text-[10px] uppercase tracking-wider text-slate-500">
                {[p.battingStyle, p.bowlingStyle].filter(Boolean).join(" · ") || "Bats & bowls"}
              </span>
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-3 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {inXI ? "Playing XI not announced yet" : "Squad not registered yet"}
          </li>
        )}
      </ul>
    </div>
  );
}

function FollowMatchButton({
  matchId,
  isFollowing,
  onToggle,
}: {
  matchId: string;
  isFollowing: boolean;
  onToggle: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onToggle();
        } finally {
          setBusy(false);
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 border px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest transition-colors disabled:opacity-50",
        isFollowing
          ? "border-[#facc15] bg-[#422006] text-[#facc15] hover:bg-[#facc15] hover:text-[#422006]"
          : "border-border bg-card text-slate-300 hover:border-[#facc15] hover:text-[#facc15]",
      )}
    >
      {isFollowing ? <BellRing className="size-3.5" /> : <Bell className="size-3.5" />}
      {isFollowing ? "Following · alerts on" : "Follow match"}
    </button>
  );
}

// ---- player of the match ---------------------------------------------------

function PlayerOfTheMatch({
  top,
  winnerTeamId,
}: {
  top: {
    playerId: string;
    name: string;
    teamName: string | null;
    teamShortCode: string | null;
    teamColor: string | null;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    sr: number;
    wickets: number;
    runsConceded: number;
    ballsBowled: number;
    econ: number;
    catches: number;
    runOuts: number;
    score: number;
  }[];
  winnerTeamId: string | null;
}) {
  const [first, second, third] = top;
  if (!first) return null;
  const highlights = [
    first.runs > 0 && `${first.runs} run${first.runs > 1 ? "s" : ""} (${first.balls} balls)`,
    first.fours > 0 && `${first.fours} four${first.fours > 1 ? "s" : ""}`,
    first.sixes > 0 && `${first.sixes} six${first.sixes > 1 ? "es" : ""}`,
    first.balls > 0 && `SR ${first.sr}`,
    first.wickets > 0 && `${first.wickets} wicket${first.wickets > 1 ? "s" : ""}`,  
    first.catches > 0 && `${first.catches} catch${first.catches > 1 ? "es" : ""}`,
  ].filter(Boolean) as string[];

  return (
    <div className="border border-[#facc15]/50 bg-gradient-to-br from-[#422006] via-[#0b1524] to-[#0b1524] px-4 py-5 panel-glow">
      <MicroLabel className="flex items-center gap-1.5 text-[#facc15]">
        <Trophy className="size-3.5" /> Player of the Match
      </MicroLabel>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center bg-[#facc15] text-xl font-black text-[#422006] led-gold">
          {first.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <PlayerLink id={first.playerId} name={first.name} className="text-lg font-black uppercase tracking-tight text-white">
            {first.name}
          </PlayerLink>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {[first.teamName, first.teamShortCode].filter(Boolean).join(" · ") || "—"}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-200">{highlights.join(" · ")}</p>
          {second && (
            <p className="mt-1 text-[11px] text-slate-400">
              {second.name} {second.runs > 0 ? `${second.runs}${second.runs > 1 ? "" : ""}*` : ""} · {second.wickets} wkt · {second.score} pts
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">MVP score</p>
          <p className="score-nums text-3xl font-black text-[#facc15] led-gold">{first.score}</p>
        </div>
      </div>
    </div>
  );
}

// ---- analytics tab ----------------------------------------------------------

function AnalyticsTab({ innings }: { innings: InningsView[] }) {
  if (innings.length === 0) {
    return (
      <p className="border border-border bg-card px-4 py-12 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
        Analytics appear once the match starts
      </p>
    );
  }
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {innings.map((inn) => (
        <div key={inn.id} className="border border-border bg-card panel-glow">
          <div className="flex items-center gap-2 border-b border-border bg-panel px-3 py-2">
            <TeamMark shortCode={inn.battingTeam.shortCode} color={inn.battingTeam.color} size="sm" />
            <span className="text-xs font-extrabold uppercase tracking-wide text-white">
              {inningsLabel(inn.number)} · {inn.battingTeam.name}
            </span>
            <span className="score-nums ml-auto text-sm font-black text-white">
              {inn.totalRuns}/{inn.wickets}
            </span>
          </div>
          <div className="space-y-5 p-3">
            <div>
              <MicroLabel className="mb-1.5 block text-slate-500">Over-by-over (Manhattan)</MicroLabel>
              <ManhattanChart innings={inn} />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <MicroLabel className="mb-1.5 block text-slate-500">Wagon wheel · {inn.wagonWheel.length} shots</MicroLabel>
                <WagonWheel innings={inn} />
              </div>
              <div className="space-y-3">
                <div>
                  <MicroLabel className="mb-1.5 block text-slate-500">Partnerships</MicroLabel>
                  <ul className="divide-y divide-border/60 border border-border/60">
                    {inn.partnerships.list.map((p, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-[11px]">
                        <span className="truncate text-slate-300">{p.batters.filter(Boolean).join(" · ") || "—"}</span>
                        <span className="score-nums text-xs font-bold text-slate-100">{p.runs} ({p.balls})</span>
                      </li>
                    ))}
                    {inn.partnerships.list.length === 0 && (
                      <li className="px-3 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        No partnerships yet
                      </li>
                    )}
                  </ul>
                </div>
                <div>
                  <MicroLabel className="mb-1.5 block text-slate-500">Fall of wickets</MicroLabel>
                  <ul className="divide-y divide-border/60 border border-border/60">
                    {inn.fow.map((f) => (
                      <li key={f.wickets} className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-[11px]">
                        <span className="truncate text-slate-300">{f.batterName}</span>
                        <span className="score-nums text-xs font-bold text-slate-100">
                          {f.score}/{f.wickets} <span className="text-[9px] font-medium text-slate-500">({f.overLabel})</span>
                        </span>
                      </li>
                    ))}
                    {inn.fow.length === 0 && (
                      <li className="px-3 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        No wickets yet
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CapPanel({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: "gold" | "cyan";
  rows: { key: string; name: string; team: string; value: number }[];
}) {
  return (
    <div className="border border-border bg-card panel-glow">
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border px-3 py-2",
          tone === "gold" ? "bg-[#422006]" : "bg-[#083344]",
        )}
      >
        <Trophy className={cn("size-4", tone === "gold" ? "text-[#facc15]" : "text-[#22d3ee]")} />
        <MicroLabel className={tone === "gold" ? "text-[#facc15]" : "text-[#22d3ee]"}>
          {title}
        </MicroLabel>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.slice(0, 10).map((r, i) => (
          <li key={r.key} className="flex items-center gap-2.5 px-3 py-2">
            <span className="score-nums w-4 text-[10px] font-extrabold text-slate-500">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-100">{r.name}</span>
              <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                {r.team}
              </span>
            </span>
            <span
              className={cn(
                "score-nums text-right text-sm font-black",
                tone === "gold" ? "text-[#facc15]" : "text-[#22d3ee]",
              )}
            >
              {r.value}
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-3 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
            No entries yet
          </li>
        )}
      </ul>
    </div>
  );
}
