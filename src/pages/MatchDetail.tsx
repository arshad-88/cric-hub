import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { useParams } from "react-router";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { InningsPanel } from "@/components/InningsPanel";
import { CommentaryFeed } from "@/components/CommentaryFeed";
import { StreamEmbed } from "@/components/StreamEmbed";
import { PointsTable } from "@/components/PointsTable";
import { BallChip, MicroLabel, StatusPill, TeamMark } from "@/components/swiss";
import { formatDate, formatTime, type InningsView } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Clapperboard,
  MapPin,
  Trophy,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Id } from "@/convex/_generated/dataModel";

type TabKey = "scorecard" | "overs" | "commentary" | "xi" | "points" | "caps";

const TABS: { key: TabKey; label: string }[] = [
  { key: "scorecard", label: "Scorecard" },
  { key: "overs", label: "Overs" },
  { key: "commentary", label: "Commentary" },
  { key: "xi", label: "Playing XI" },
  { key: "points", label: "Points" },
  { key: "caps", label: "Caps" },
];

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabKey>("scorecard");
  const scorecard = useQuery(api.scorecard.get, id ? { matchId: id as Id<"matches"> } : "skip");

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

  return (
    <div className="flex min-h-screen flex-col bg-background">
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

          <div className="stadium-gradient mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border border-border px-4 py-6 panel-glow">
            <div className="flex items-center gap-3">
              <TeamMark shortCode={teamA.shortCode} color={teamA.color} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-black uppercase tracking-tight text-white">
                  {teamA.name}
                </p>
                {innings[0] && (
                  <p className="score-nums text-3xl font-black text-white led-green">
                    {innings[0].totalRuns}/{innings[0].wickets}
                    <span className="ml-1.5 text-sm font-bold text-slate-400">
                      ({innings[0].oversLabel})
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="text-center">
              <span className="micro-label text-slate-500">vs</span>
            </div>
            <div className="flex items-center justify-end gap-3 text-right">
              <div className="min-w-0">
                <p className="truncate text-lg font-black uppercase tracking-tight text-white">
                  {teamB.name}
                </p>
                {innings[1] && (
                  <p className="score-nums text-3xl font-black text-white led-green">
                    {innings[1].totalRuns}/{innings[1].wickets}
                    <span className="ml-1.5 text-sm font-bold text-slate-400">
                      ({innings[1].oversLabel})
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
          {toss && (
            <p className="mt-3 text-[11px] font-medium uppercase tracking-widest text-slate-500">
              Toss — {toss}
            </p>
          )}
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

          {tab === "commentary" && (
            <div className="mx-auto max-w-2xl">
              <MicroLabel className="mb-2 block">Full commentary</MicroLabel>
              <CommentaryFeed balls={currentInnings?.commentary ?? []} />
            </div>
          )}

          {tab === "xi" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <XIPanel name={teamA.name} shortCode={teamA.shortCode} color={teamA.color} squad={teamASquad ?? []} />
              <XIPanel name={teamB.name} shortCode={teamB.shortCode} color={teamB.color} squad={teamBSquad ?? []} />
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
              live && inn.isCurrent ? "bg-[#052e16]" : "bg-[#0b1524]",
            )}
          >
            <span className="flex items-center gap-2">
              <TeamMark shortCode={inn.battingTeam.shortCode} color={inn.battingTeam.color} size="sm" />
              <span className="text-xs font-extrabold uppercase tracking-wide text-white">
                {inn.number === 1 ? "1st innings" : "2nd innings"}
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
}: {
  name: string;
  shortCode: string;
  color: string;
  squad: { _id: string; name: string; role: string; battingStyle?: string; bowlingStyle?: string; jerseyNumber?: number }[];
}) {
  return (
    <div className="border border-border bg-card panel-glow">
      <div className="flex items-center gap-2.5 border-b border-border bg-[#0b1524] px-3 py-2.5">
        <TeamMark shortCode={shortCode} color={color} size="sm" />
        <span className="truncate text-sm font-extrabold uppercase tracking-tight text-white">
          {name}
        </span>
        <span className="micro-label ml-auto text-slate-500">XI · {squad.length}</span>
      </div>
      <ul className="divide-y divide-border/60">
        {squad.map((p) => (
          <li key={p._id} className="flex items-center gap-3 px-3 py-2">
            <span className="score-nums w-6 shrink-0 text-center text-[10px] font-black text-slate-500">
              {p.jerseyNumber ?? "—"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-100">{p.name}</span>
              <span className="block truncate text-[10px] uppercase tracking-wider text-slate-500">
                {[p.battingStyle, p.bowlingStyle].filter(Boolean).join(" · ") || p.role}
              </span>
            </span>
            <span className="shrink-0 bg-[#22c55e]/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[#22c55e]">
              {p.role}
            </span>
          </li>
        ))}
        {squad.length === 0 && (
          <li className="px-3 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Squad not registered yet
          </li>
        )}
      </ul>
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
