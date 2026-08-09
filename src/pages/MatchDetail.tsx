import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useParams } from "react-router";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { InningsPanel } from "@/components/InningsPanel";
import { CommentaryFeed } from "@/components/CommentaryFeed";
import { StreamEmbed } from "@/components/StreamEmbed";
import { MicroLabel, StatusPill, TeamMark } from "@/components/swiss";
import { formatDate, formatTime } from "@/lib/vpl";
import { Calendar, Clapperboard, MapPin, RotateCcw } from "lucide-react";
import { Link } from "react-router";
import { motion } from "framer-motion";

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const scorecard = useQuery(api.scorecard.get, id ? { matchId: id } : "skip");

  if (scorecard === undefined) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-20">
          <div className="h-10 w-10 animate-spin border-2 border-foreground border-t-transparent" />
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (scorecard === null) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-20">
          <p className="border border-foreground bg-white px-4 py-14 text-center text-xs font-bold uppercase tracking-widest text-foreground/40">
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
      ? `${match.tossWinnerId === teamA.id ? teamA.name : teamB.name} won the toss and chose to ${match.tossDecision}`
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {/* match header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MicroLabel className="text-[#002FA7]">
                {match.stage ?? "Match"} · {match.overs} overs
              </MicroLabel>
              <StatusPill status={match.status} />
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-foreground/60">
              <Calendar className="size-3.5" />
              {formatDate(match.startTime)} · {formatTime(match.startTime)}
              {match.venue && (
                <>
                  <span className="text-foreground/25">|</span>
                  <MapPin className="size-3.5" />
                  {match.venue}
                </>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border border-foreground bg-white px-4 py-5">
            <div className="flex items-center gap-3">
              <TeamMark shortCode={teamA.shortCode} color={teamA.color} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold uppercase tracking-tight">
                  {teamA.name}
                </p>
                {innings[0] && (
                  <p className="score-nums text-2xl font-extrabold text-foreground/80">
                    {innings[0].totalRuns}/{innings[0].wickets}
                    <span className="ml-1.5 text-xs font-bold text-foreground/45">
                      ({innings[0].oversLabel})
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="text-center">
              <span className="micro-label text-foreground/40">vs</span>
            </div>
            <div className="flex items-center justify-end gap-3 text-right">
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold uppercase tracking-tight">
                  {teamB.name}
                </p>
                {innings[1] && (
                  <p className="score-nums text-2xl font-extrabold text-foreground/80">
                    {innings[1].totalRuns}/{innings[1].wickets}
                    <span className="ml-1.5 text-xs font-bold text-foreground/45">
                      ({innings[1].oversLabel})
                    </span>
                  </p>
                )}
              </div>
              <TeamMark shortCode={teamB.shortCode} color={teamB.color} size="lg" />
            </div>
          </div>

          {result && (
            <p className="mt-3 border-l-4 border-[#E4002B] bg-[#E4002B]/[0.06] px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide text-[#E4002B]">
              {result}
            </p>
          )}
          {toss && (
            <p className="mt-3 text-[11px] font-medium uppercase tracking-widest text-foreground/55">
              Toss — {toss}
            </p>
          )}
        </motion.div>

        {/* body */}
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.25fr_1fr]">
          <div className="space-y-6">
            <div>
              <MicroLabel className="mb-2 block">Scorecard</MicroLabel>
              {innings.length === 0 ? (
                <div className="border border-foreground bg-white px-4 py-12 text-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-foreground/50">
                    {match.status === "UPCOMING"
                      ? "Toss yet to happen — check back at match time"
                      : "Scorecard coming soon"}
                  </p>
                  {live && (
                    <Link
                      to="/dashboard"
                      className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#002FA7] hover:underline"
                    >
                      <RotateCcw className="size-3.5" /> Scorer: start the match
                    </Link>
                  )}
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
              <StreamEmbed url={match.streamUrl} />
            </div>
            <div>
              <MicroLabel className="mb-2 block">Ball-by-ball</MicroLabel>
              <CommentaryFeed balls={currentInnings?.commentary ?? []} />
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
