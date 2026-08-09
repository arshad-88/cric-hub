import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { InningsPanel } from "@/components/InningsPanel";
import { CommentaryFeed } from "@/components/CommentaryFeed";
import { StreamEmbed } from "@/components/StreamEmbed";
import { MatchCard } from "@/components/MatchCard";
import { BallChip, MicroLabel, SectionHeading } from "@/components/swiss";
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
import type { Id } from "@/convex/_generated/dataModel";

function StatBlock({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="border border-border bg-card px-4 py-5 text-center panel-glow">
      <p className="score-nums text-3xl font-extrabold tracking-tight text-white">{value}</p>
      <MicroLabel className="mt-1 block text-slate-500">{label}</MicroLabel>
    </div>
  );
}

export default function Landing() {
  const featured = useQuery(api.tournaments.getActive);
  const tournaments = useQuery(api.tournaments.list);
  const liveMatches = useQuery(api.matches.list, { status: "LIVE" });
  const upcoming = useQuery(api.matches.list, { status: "UPCOMING" });
  const completed = useQuery(api.matches.list, { status: "COMPLETED" });
  const teams = useQuery(api.teams.listActive);
  const leaderboard = useQuery(api.leaderboard.get, {});

  const liveMatchId = liveMatches?.[0]?.id;
  const live = useQuery(
    api.scorecard.get,
    liveMatchId ? { matchId: liveMatchId as Id<"matches"> } : "skip",
  );

  const nextFixtures = (upcoming ?? []).slice(0, 3);
  const activeTours = (tournaments ?? []).filter((t) => t.status === "ACTIVE");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      {/* ================= STADIUM HERO ================= */}
      <section className="stadium-gradient border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-3">
              <span className="live-dot size-2.5 rounded-full bg-[#ef4444] glow-red" aria-hidden />
              <MicroLabel className="text-[#22c55e]">
                Community cricket · live broadcasts
              </MicroLabel>
            </div>

            <h1 className="mt-5 max-w-4xl text-5xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-7xl">
              Village cricket.
              <br />
              Live,{" "}
              <span className="text-[#22c55e] led-green">ball</span> by{" "}
              <span className="text-[#facc15] led-gold">ball</span>.
            </h1>

            <p className="mt-6 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
              Every tournament in the district — real-time scores, ball-by-ball
              commentary, points tables, caps and live YouTube / Twitch streams.
              Open to the whole crowd, no sign-in needed. Scored pitch-side by
              your organizers.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/matches"
                className="inline-flex items-center gap-2 bg-[#22c55e] px-5 py-3 text-xs font-black uppercase tracking-widest text-[#052e16] transition-colors hover:bg-[#facc15] hover:text-[#422006]"
              >
                <Radio className="size-4" />
                Live scores
              </Link>
              <Link
                to={live ? `/matches/${liveMatchId}` : "/tournaments"}
                className="inline-flex items-center gap-2 border-2 border-[#22d3ee] px-5 py-3 text-xs font-black uppercase tracking-widest text-[#22d3ee] transition-colors hover:bg-[#22d3ee] hover:text-[#083344]"
              >
                <Play className="size-4" />
                {live ? "Watch the live final" : "Browse tournaments"}
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 px-2 py-3 text-xs font-bold uppercase tracking-widest text-slate-400 underline decoration-[#22c55e] decoration-2 underline-offset-4 transition-colors hover:text-white"
              >
                Organizer sign-in <ArrowRight className="size-4" />
              </Link>
            </div>
          </motion.div>

          <div className="mt-12 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
            <StatBlock value={teams?.length ?? "—"} label="Teams this season" />
            <StatBlock value={liveMatches?.length ?? "—"} label="Live now" />
            <StatBlock value={upcoming?.length ?? "—"} label="Upcoming" />
            <StatBlock value={completed?.length ?? "—"} label="Played" />
          </div>
        </div>
      </section>

      {/* ================= LIVE MATCH CENTER ================= */}
      {live && (
        <section className="border-b border-border bg-[#0b1524]/60">
          <div className="mx-auto max-w-7xl px-4 py-12">
            <SectionHeading index="01" title="Match center — live" className="mb-6" />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <InningsPanel innings={live.currentInnings ?? live.innings[0]} active />
                <Link
                  to={`/matches/${live.match.id}`}
                  className="inline-flex items-center gap-2 bg-[#ef4444] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#22c55e] hover:text-[#052e16]"
                >
                  Open match center <ArrowRight className="size-4" />
                </Link>
              </div>
              <div className="space-y-4">
                <StreamEmbed url={live.match.streamUrl ?? null} />
                <CommentaryFeed balls={live.currentInnings?.commentary.slice(0, 6) ?? []} />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================= FEATURES ================= */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <SectionHeading index="02" title="Built for the district" className="mb-6" />
          <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
            {[
              {
                icon: <Gauge className="size-6" />,
                title: "Real-time scorecard",
                body: "Score, wickets, overs, CRR & RRR update the instant the scorer taps a button. The whole ground sees the same ball, together.",
              },
              {
                icon: <Clapperboard className="size-6" />,
                title: "Watch & score side-by-side",
                body: "Embedded YouTube or Twitch stream sits beside the scorecard and the ball-by-ball feed — no tab-hopping at the tea stall.",
              },
              {
                icon: <Trophy className="size-6" />,
                title: "Caps & points table",
                body: "Auto-updating points, net run rate, Orange Cap run leaders and Purple Cap wicket-takers across every completed match.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-card px-5 py-6 panel-glow">
                <span className="flex size-10 items-center justify-center border border-border bg-[#0b1524] text-[#22c55e]">
                  {f.icon}
                </span>
                <h3 className="mt-4 text-sm font-extrabold uppercase tracking-tight text-white">
                  {f.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= TOURNAMENTS ================= */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <SectionHeading index="03" title="Tournaments" className="flex-1" />
            <Link
              to="/tournaments"
              className="hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#22d3ee] hover:underline sm:inline-flex"
            >
              All tournaments <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {activeTours.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {activeTours.slice(0, 3).map((t) => (
                <TournamentCard
                  key={t.id}
                  id={t.id}
                  name={t.name}
                  year={t.year}
                  city={t.city}
                  ballType={t.ballType}
                  teamsCount={t.teamsCount}
                  liveMatchId={t.liveMatchId}
                />
              ))}
            </div>
          ) : (
            <p className="border border-border bg-card px-4 py-10 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
              Tournaments will appear here once scheduled
            </p>
          )}
        </div>
      </section>

      {/* ================= FIXTURES ================= */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <SectionHeading index="04" title="Upcoming fixtures" className="flex-1" />
            <Link
              to="/matches"
              className="hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#22d3ee] hover:underline sm:inline-flex"
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
            <p className="border border-border bg-card px-4 py-10 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
              Fixtures will appear here once scheduled
            </p>
          )}
        </div>
      </section>

      {/* ================= CAPS PREVIEW ================= */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <SectionHeading index="05" title="Cap leaders" className="flex-1" />
            <Link
              to="/leaderboard"
              className="hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#22d3ee] hover:underline sm:inline-flex"
            >
              Full stats <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="border border-border bg-card panel-glow">
              <div className="flex items-center gap-2 border-b border-border bg-[#052e16] px-3 py-2">
                <Trophy className="size-4 text-[#facc15]" />
                <MicroLabel className="text-[#facc15]">Orange cap · Runs</MicroLabel>
              </div>
              <ul className="divide-y divide-border/60">
                {(leaderboard?.topBatters ?? []).slice(0, 3).map((b, i) => (
                  <li key={b.playerId} className="flex items-center gap-2.5 px-3 py-2.5">
                    <span className="score-nums w-4 text-[10px] font-extrabold text-slate-500">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-100">{b.name}</span>
                      <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        {b.team?.name ?? "—"}
                      </span>
                    </span>
                    <span className="score-nums text-right text-sm font-extrabold text-[#facc15]">
                      {b.runs}
                    </span>
                  </li>
                ))}
                {(leaderboard?.topBatters ?? []).length === 0 && (
                  <li className="px-3 py-6 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    No runs scored yet
                  </li>
                )}
              </ul>
            </div>

            <div className="border border-border bg-card panel-glow">
              <div className="flex items-center gap-2 border-b border-border bg-[#083344] px-3 py-2">
                <Trophy className="size-4 text-[#22d3ee]" />
                <MicroLabel className="text-[#22d3ee]">Purple cap · Wickets</MicroLabel>
              </div>
              <ul className="divide-y divide-border/60">
                {(leaderboard?.topBowlers ?? []).slice(0, 3).map((b, i) => (
                  <li key={b.playerId} className="flex items-center gap-2.5 px-3 py-2.5">
                    <span className="score-nums w-4 text-[10px] font-extrabold text-slate-500">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-100">{b.name}</span>
                      <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        {b.team?.name ?? "—"}
                      </span>
                    </span>
                    <span className="score-nums text-right text-sm font-extrabold text-[#22d3ee]">
                      {b.wickets}
                    </span>
                  </li>
                ))}
                {(leaderboard?.topBowlers ?? []).length === 0 && (
                  <li className="px-3 py-6 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    No wickets yet
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ================= ROLES ================= */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <SectionHeading index="06" title="Spectators & organizers" className="mb-6" />
          <div className="grid gap-px border border-border bg-border md:grid-cols-2">
            <div className="bg-card p-6 panel-glow">
              <MicroLabel className="text-[#22d3ee]">Free · no account</MicroLabel>
              <h3 className="mt-2 text-lg font-extrabold uppercase tracking-tight text-white">
                The spectator
              </h3>
              <ol className="mt-4 space-y-3">
                {[
                  "Open any match center from any phone",
                  "Watch the stream beside the live scorecard",
                  "Follow every ball in the commentary feed",
                  "Check points tables, caps and past results",
                ].map((s, i) => (
                  <li key={s} className="flex items-start gap-3 text-xs leading-relaxed text-slate-400">
                    <span className="score-nums flex size-5 shrink-0 items-center justify-center border border-border bg-[#0b1524] text-[10px] font-extrabold text-[#22d3ee]">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
            <div className="bg-card p-6 panel-glow">
              <MicroLabel className="text-[#22c55e]">Authenticated · admin only</MicroLabel>
              <h3 className="mt-2 text-lg font-extrabold uppercase tracking-tight text-white">
                The organizer & scorer
              </h3>
              <ol className="mt-4 space-y-3">
                {[
                  "Sign in and claim the admin role",
                  "Create tournaments, teams, rosters and fixtures",
                  "Set the toss, openers and bowler, then tap the keypad",
                  "Stream link, undo, overs — all from the pitch side",
                ].map((s, i) => (
                  <li key={s} className="flex items-start gap-3 text-xs leading-relaxed text-slate-400">
                    <span className="score-nums flex size-5 shrink-0 items-center justify-center border border-border bg-[#0b1524] text-[10px] font-extrabold text-[#22c55e]">
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
      <section className="stadium-gradient">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <BallChip symbol="6" kind="boundary" size="md" />
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
                A match is live somewhere.
              </h2>
              <p className="mt-1 text-xs uppercase tracking-widest text-slate-500">
                {featured ? `${featured.name} ${featured.year}` : "The district"} — don't miss a ball
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/tournaments"
              className="inline-flex items-center gap-2 bg-[#22c55e] px-5 py-3 text-xs font-black uppercase tracking-widest text-[#052e16] transition-colors hover:bg-white"
            >
              <ListOrdered className="size-4" /> Tournaments
            </Link>
            <Link
              to={live ? `/matches/${liveMatchId}` : "/matches"}
              className="inline-flex items-center gap-2 border-2 border-white/70 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-slate-900"
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

function TournamentCard({
  id,
  name,
  year,
  city,
  ballType,
  teamsCount,
  liveMatchId,
}: {
  id: string;
  name: string;
  year: number;
  city?: string;
  ballType?: string;
  teamsCount: number;
  liveMatchId?: string | null;
}) {
  const href = liveMatchId ? `/matches/${liveMatchId}` : `/matches?tournament=${id}`;
  return (
    <Link
      to={href}
      className="group border border-border bg-card p-5 transition-all hover:border-[#22c55e]/70 hover:glow-green"
    >
      <div className="flex items-center justify-between">
        <span className="flex size-11 items-center justify-center bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-lg font-black text-[#052e16]">
          {name.charAt(0)}
        </span>
        <span className="micro-label text-[#22c55e]">{liveMatchId ? "LIVE" : "ACTIVE"}</span>
      </div>
      <h3 className="mt-4 text-base font-extrabold uppercase tracking-tight text-white">
        {name} <span className="text-slate-500">{year}</span>
      </h3>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {[city, ballType].filter(Boolean).join(" · ") || "Details soon"}
      </p>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {teamsCount} teams · Follow the action
      </p>
    </Link>
  );
}
