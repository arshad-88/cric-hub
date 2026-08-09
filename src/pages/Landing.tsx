import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { InningsPanel } from "@/components/InningsPanel";
import { CommentaryFeed } from "@/components/CommentaryFeed";
import { StreamEmbed } from "@/components/StreamEmbed";
import { MatchCard } from "@/components/MatchCard";
import { PointsTable } from "@/components/PointsTable";
import { MicroLabel, SectionHeading } from "@/components/swiss";
import {
  ArrowRight,
  Clapperboard,
  Gauge,
  ListOrdered,
  Play,
  Radio,
  Trophy,
} from "lucide-react";
import { motion } from "framer-motion";

function StatBlock({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="border border-foreground bg-white px-4 py-5 text-center">
      <p className="score-nums text-3xl font-extrabold tracking-tight">{value}</p>
      <MicroLabel className="mt-1 block text-foreground/55">{label}</MicroLabel>
    </div>
  );
}

export default function Landing() {
  const tournament = useQuery(api.tournaments.getActive);
  const liveMatches = useQuery(api.matches.list, { status: "LIVE" });
  const upcoming = useQuery(api.matches.list, { status: "UPCOMING" });
  const completed = useQuery(api.matches.list, { status: "COMPLETED" });
  const teams = useQuery(api.teams.listActive);
  const leaderboard = useQuery(api.leaderboard.get);

  const liveMatchId = liveMatches?.[0]?.id;
  const live = useQuery(
    api.scorecard.get,
    liveMatchId ? { matchId: liveMatchId } : "skip",
  );

  const nextFixtures = (upcoming ?? []).slice(0, 3);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      {/* ================= HERO ================= */}
      <section className="border-b border-foreground">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-3">
              <span className="size-3 bg-[#E4002B]" aria-hidden />
              <MicroLabel className="text-[#002FA7]">
                {tournament ? `${tournament.name} · ${tournament.year}` : "Village Premiere League"}
              </MicroLabel>
            </div>

            <h1 className="mt-5 max-w-4xl text-5xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-7xl">
              Village cricket.
              <br />
              Live,{" "}
              <span className="relative inline-block bg-[#E4002B] px-2 text-white">
                ball
              </span>{" "}
              by ball.
            </h1>

            <p className="mt-6 max-w-xl text-sm leading-relaxed text-foreground/70 sm:text-base">
              Real-time scores, ball-by-ball commentary, points tables and live
              YouTube / Twitch streams for the Vasavi Premiere League — on any
              device, no sign-in required. Scored pitch-side by your village
              scorers.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/matches"
                className="inline-flex items-center gap-2 bg-foreground px-5 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#E4002B]"
              >
                <Radio className="size-4" />
                Live scores
              </Link>
              <Link
                to={live ? `/matches/${liveMatchId}` : "/matches"}
                className="inline-flex items-center gap-2 border-2 border-[#002FA7] px-5 py-3 text-xs font-bold uppercase tracking-widest text-[#002FA7] transition-colors hover:bg-[#002FA7] hover:text-white"
              >
                <Play className="size-4" />
                {live ? "Watch the final" : "Match center"}
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 px-2 py-3 text-xs font-bold uppercase tracking-widest text-foreground/60 underline decoration-[#E4002B] decoration-2 underline-offset-4 hover:text-foreground"
              >
                Scorer sign-in <ArrowRight className="size-4" />
              </Link>
            </div>
          </motion.div>

          <div className="mt-12 grid grid-cols-2 gap-px border border-foreground bg-foreground sm:grid-cols-4">
            <StatBlock value={teams?.length ?? "—"} label="Teams" />
            <StatBlock value={liveMatches?.length ?? "—"} label="Live now" />
            <StatBlock value={upcoming?.length ?? "—"} label="Upcoming" />
            <StatBlock value={completed?.length ?? "—"} label="Played" />
          </div>
        </div>
      </section>

      {/* ================= LIVE MATCH CENTER ================= */}
      {live && (
        <section className="border-b border-foreground bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <SectionHeading index="01" title="Match center — live" className="mb-6" />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <InningsPanel innings={live.currentInnings ?? live.innings[0]} active />
                <Link
                  to={`/matches/${live.match.id}`}
                  className="inline-flex items-center gap-2 bg-[#E4002B] px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-foreground"
                >
                  Open match center <ArrowRight className="size-4" />
                </Link>
              </div>
              <div className="space-y-4">
                <StreamEmbed url={live.match.streamUrl} />
                <CommentaryFeed balls={live.currentInnings?.commentary.slice(0, 6) ?? []} />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================= FEATURES ================= */}
      <section className="border-b border-foreground">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <SectionHeading index="02" title="Built for the village" className="mb-6" />
          <div className="grid gap-px border border-foreground bg-foreground sm:grid-cols-3">
            {[
              {
                icon: <Gauge className="size-6" />,
                title: "Real-time scorecard",
                body: "Score, wickets, overs, CRR & RRR update the instant the scorer taps a button. Every viewer sees the same ball, together.",
              },
              {
                icon: <Clapperboard className="size-6" />,
                title: "Watch & score side-by-side",
                body: "Embedded YouTube or Twitch stream sits next to the scorecard and ball-by-ball feed — no tab-hopping at the tea stall.",
              },
              {
                icon: <Trophy className="size-6" />,
                title: "Caps & points table",
                body: "Auto-updating points, net run rate, Orange Cap run leaders and Purple Cap wicket-takers across every completed match.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-white px-5 py-6">
                <span className="flex size-10 items-center justify-center border border-foreground">
                  {f.icon}
                </span>
                <h3 className="mt-4 text-sm font-extrabold uppercase tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-foreground/65">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FIXTURES ================= */}
      <section className="border-b border-foreground">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <SectionHeading index="03" title="Fixtures" className="flex-1" />
            <Link
              to="/matches"
              className="hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#002FA7] hover:underline sm:inline-flex"
            >
              All matches <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {nextFixtures.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {nextFixtures.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          ) : (
            <p className="border border-foreground bg-white px-4 py-10 text-center text-xs font-bold uppercase tracking-widest text-foreground/40">
              Fixtures will appear here once scheduled
            </p>
          )}
          <Link
            to="/matches"
            className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#002FA7] hover:underline sm:hidden"
          >
            All matches <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>

      {/* ================= LEADERBOARD PREVIEW ================= */}
      <section className="border-b border-foreground">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <SectionHeading index="04" title="The table" className="flex-1" />
            <Link
              to="/leaderboard"
              className="hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#002FA7] hover:underline sm:inline-flex"
            >
              Full stats <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <PointsTable rows={(leaderboard?.pointsTable ?? []).slice(0, 6)} />

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
              <div className="border border-foreground bg-white">
                <div className="flex items-center gap-2 border-b border-foreground bg-[#E4002B] px-3 py-2 text-white">
                  <Trophy className="size-4" />
                  <MicroLabel className="text-white">Orange cap · Runs</MicroLabel>
                </div>
                <ul className="divide-y divide-foreground/10">
                  {(leaderboard?.topBatters ?? []).slice(0, 3).map((b, i) => (
                    <li key={b.playerId} className="flex items-center gap-2.5 px-3 py-2.5">
                      <span className="score-nums w-4 text-[10px] font-extrabold text-foreground/40">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{b.name}</span>
                        <span className="block text-[10px] font-medium uppercase tracking-wider text-foreground/50">
                          {b.team?.name ?? "—"}
                        </span>
                      </span>
                      <span className="score-nums text-right text-sm font-extrabold">
                        {b.runs}
                      </span>
                    </li>
                  ))}
                  {(leaderboard?.topBatters ?? []).length === 0 && (
                    <li className="px-3 py-6 text-center text-[10px] font-bold uppercase tracking-widest text-foreground/40">
                      No runs scored yet
                    </li>
                  )}
                </ul>
              </div>

              <div className="border border-foreground bg-white">
                <div className="flex items-center gap-2 border-b border-foreground bg-[#002FA7] px-3 py-2 text-white">
                  <Trophy className="size-4" />
                  <MicroLabel className="text-white">Purple cap · Wickets</MicroLabel>
                </div>
                <ul className="divide-y divide-foreground/10">
                  {(leaderboard?.topBowlers ?? []).slice(0, 3).map((b, i) => (
                    <li key={b.playerId} className="flex items-center gap-2.5 px-3 py-2.5">
                      <span className="score-nums w-4 text-[10px] font-extrabold text-foreground/40">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{b.name}</span>
                        <span className="block text-[10px] font-medium uppercase tracking-wider text-foreground/50">
                          {b.team?.name ?? "—"}
                        </span>
                      </span>
                      <span className="score-nums text-right text-sm font-extrabold">
                        {b.wickets}
                      </span>
                    </li>
                  ))}
                  {(leaderboard?.topBowlers ?? []).length === 0 && (
                    <li className="px-3 py-6 text-center text-[10px] font-bold uppercase tracking-widest text-foreground/40">
                      No wickets yet
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="border-b border-foreground">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <SectionHeading index="05" title="Two roles, one league" className="mb-6" />
          <div className="grid gap-px border border-foreground bg-foreground md:grid-cols-2">
            <div className="bg-white p-6">
              <MicroLabel className="text-[#002FA7]">Role A · Free</MicroLabel>
              <h3 className="mt-2 text-lg font-extrabold uppercase tracking-tight">
                The viewer
              </h3>
              <ol className="mt-4 space-y-3">
                {[
                  "Open the match center from any phone",
                  "Watch the stream beside the live scorecard",
                  "Follow every ball in the commentary feed",
                  "Check the table and the cap leaders",
                ].map((s, i) => (
                  <li key={s} className="flex items-start gap-3 text-xs leading-relaxed text-foreground/70">
                    <span className="score-nums flex size-5 shrink-0 items-center justify-center border border-foreground text-[10px] font-extrabold">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
            <div className="bg-white p-6">
              <MicroLabel className="text-[#E4002B]">Role B · Scorer</MicroLabel>
              <h3 className="mt-2 text-lg font-extrabold uppercase tracking-tight">
                The ground scorer
              </h3>
              <ol className="mt-4 space-y-3">
                {[
                  "Sign in and claim the scorer role",
                  "Set the toss, openers and bowler",
                  "Tap 0–6, wickets, wides & no-balls on the big keypad",
                  "Stream link, undo, overs — all from the pitch side",
                ].map((s, i) => (
                  <li key={s} className="flex items-start gap-3 text-xs leading-relaxed text-foreground/70">
                    <span className="score-nums flex size-5 shrink-0 items-center justify-center border border-foreground text-[10px] font-extrabold">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="bg-foreground text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="size-4 bg-[#E4002B]" aria-hidden />
            <div>
              <h2 className="text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">
                The final is live.
              </h2>
              <p className="mt-1 text-xs uppercase tracking-widest text-white/60">
                {tournament ? `${tournament.name} ${tournament.year}` : "VPL 2026"} — don't miss a ball
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/matches"
              className="inline-flex items-center gap-2 bg-[#E4002B] px-5 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-foreground"
            >
              <ListOrdered className="size-4" /> Full schedule
            </Link>
            <Link
              to={live ? `/matches/${liveMatchId}` : "/matches"}
              className="inline-flex items-center gap-2 border-2 border-white px-5 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-foreground"
            >
              <Radio className="size-4" /> Watch live
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
