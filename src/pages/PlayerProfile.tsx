import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { MicroLabel, SectionHeading, TeamMark } from "@/components/swiss";
import { formatDate } from "@/lib/format";
import { ArrowLeft, UserRound } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Id } from "@/convex/_generated/dataModel";

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const profile = useQuery(
    api.players.getProfile,
    id ? { playerId: id as Id<"players"> } : "skip",
  );

  if (profile === undefined) {
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

  if (profile === null) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-20">
          <p className="border border-border bg-card px-4 py-14 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
            Player not found
          </p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const { player, team, tournament, batting, bowling, fielding, recent, auctionHistory } = profile;

  const formChart = recent
    .slice(0, 8)
    .map((r) => ({
      name: formatDate(r.startTime),
      Runs: r.runs,
      Wkts: r.wickets,
    }))
    .reverse();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Link
          to={team ? `/teams/${team._id}` : "/teams"}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-[#22d3ee]"
        >
          <ArrowLeft className="size-3.5" /> Back to {team?.name ?? "teams"}
        </Link>

        {/* header */}
        <div className="mt-6 flex flex-wrap items-center gap-4 border border-border bg-card px-5 py-6 panel-glow">
          <span className="flex size-16 items-center justify-center border border-border bg-[#0b1524] text-[#22c55e]">
            <UserRound className="size-8" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">
                {player.name}
              </h1>
              {player.isCaptain && (
                <span className="bg-[#facc15] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[#422006]">
                  Captain
                </span>
              )}
              {player.isPlayingXI && (
                <span className="bg-[#22c55e]/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[#22c55e]">
                  Playing XI
                </span>
              )}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              {team && (
                <span className="flex items-center gap-1.5">
                  <TeamMark shortCode={team.shortCode} color={team.color} size="sm" />
                  {team.name}
                </span>
              )}
              <span>{player.role}</span>
              {player.jerseyNumber != null && <span>#{player.jerseyNumber}</span>}
              <span>{tournament?.name ?? "League"}</span>
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-slate-600">
              {[player.battingStyle, player.bowlingStyle].filter(Boolean).join(" · ") || "—"}
              {player.phone ? ` · ${profile.leagues} league${profile.leagues === 1 ? "" : "s"}` : ""}
            </p>
          </div>
        </div>

        {/* performance dashboard */}
        <SectionHeading index="01" title="Performance" className="mt-10" />

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Matches" value={String(batting.matches)} tone="slate" />
          <StatCard label="Runs" value={String(batting.runs)} tone="gold" />
          <StatCard label="Average" value={batting.avg.toFixed(2)} tone="cyan" />
          <StatCard label="Strike rate" value={batting.sr.toFixed(1)} tone="green" />
          <StatCard label="Wickets" value={String(bowling.wickets)} tone="red" />
          <StatCard label="Economy" value={bowling.econ.toFixed(2)} tone="cyan" />
          <StatCard label="Catches" value={String(fielding.catches)} tone="gold" />
          <StatCard label="MVP impact" value={`${batting.fifties + batting.hundreds} 50s`} tone="slate" />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          {/* batting */}
          <div className="border border-border bg-card panel-glow">
            <div className="border-b border-border bg-[#422006] px-3 py-2">
              <MicroLabel className="text-[#facc15]">Batting</MicroLabel>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-4 text-sm sm:grid-cols-3">
              <StatRow k="Innings" v={String(batting.innings)} />
              <StatRow k="Balls faced" v={String(batting.balls)} />
              <StatRow k="Fours" v={String(batting.fours)} />
              <StatRow k="Sixes" v={String(batting.sixes)} />
              <StatRow k="50s" v={String(batting.fifties)} />
              <StatRow k="100s" v={String(batting.hundreds)} />
            </div>
          </div>

          {/* bowling */}
          <div className="border border-border bg-card panel-glow">
            <div className="border-b border-border bg-[#083344] px-3 py-2">
              <MicroLabel className="text-[#22d3ee]">Bowling</MicroLabel>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-4 text-sm sm:grid-cols-3">
              <StatRow k="Overs" v={bowling.overs} />
              <StatRow k="Runs conceded" v={String(bowling.runs)} />
              <StatRow k="Best figure" v={`${bowling.wickets}/${bowling.runs}`} />
              <StatRow k="3-wkt hauls" v={String(bowling.threeWkts)} />
              <StatRow k="4-wkt hauls" v={String(bowling.fourWkts)} />
              <StatRow k="5-wkt hauls" v={String(bowling.fiveWkts)} />
            </div>
          </div>

          {/* fielding */}
          <div className="border border-border bg-card panel-glow">
            <div className="border-b border-border bg-[#052e16] px-3 py-2">
              <MicroLabel className="text-[#22c55e]">Fielding</MicroLabel>
            </div>
            <div className="grid grid-cols-3 gap-x-6 gap-y-2 px-4 py-4 text-sm">
              <StatRow k="Catches" v={String(fielding.catches)} />
              <StatRow k="Run outs" v={String(fielding.runOuts)} />
              <StatRow k="Stumpings" v={String(fielding.stumpings)} />
            </div>
          </div>

          {/* form chart */}
          <div className="border border-border bg-card panel-glow">
            <div className="border-b border-border bg-[#0b1524] px-3 py-2">
              <MicroLabel>Recent form · runs &amp; wickets per match</MicroLabel>
            </div>
            <div className="h-52 px-2 py-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formChart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 9 }} interval={0} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 9 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#0b1524",
                      border: "1px solid #1e293b",
                      borderRadius: 0,
                      fontSize: 11,
                    }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Bar dataKey="Runs" fill="#facc15" />
                  <Bar dataKey="Wkts" fill="#22d3ee" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* recent performances */}
        <SectionHeading index="02" title="Recent performances" className="mt-10" />
        <div className="mt-4 overflow-x-auto border border-border bg-card panel-glow">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-[#0b1524] text-[9px] font-bold uppercase tracking-widest text-slate-500">
                <th className="px-3 py-2">Match</th>
                <th className="px-3 py-2">R</th>
                <th className="px-3 py-2">B</th>
                <th className="px-3 py-2">4s</th>
                <th className="px-3 py-2">6s</th>
                <th className="px-3 py-2">W</th>
                <th className="px-3 py-2">Econ</th>
                <th className="px-3 py-2">Catches</th>
                <th className="px-3 py-2">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {recent.map((r) => (
                <tr key={r.matchId} className="hover:bg-[#22c55e]/[0.04]">
                  <td className="px-3 py-2">
                    <Link
                      to={`/matches/${r.matchId}`}
                      className="font-bold text-slate-100 hover:text-[#22c55e]"
                    >
                      vs {r.opponent ?? "TBD"}
                    </Link>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                      {formatDate(r.startTime)}
                    </span>
                  </td>
                  <td className="score-nums px-3 py-2">{r.runs}{r.out ? "" : "*"}</td>
                  <td className="score-nums px-3 py-2 text-slate-400">{r.balls}</td>
                  <td className="score-nums px-3 py-2 text-slate-400">{r.fours}</td>
                  <td className="score-nums px-3 py-2 text-slate-400">{r.sixes}</td>
                  <td className="score-nums px-3 py-2 text-[#22d3ee]">{r.wickets}</td>
                  <td className="score-nums px-3 py-2 text-slate-400">
                    {r.ballsBowled > 0
                      ? ((r.runsConceded / (r.ballsBowled / 6)) || 0).toFixed(2)
                      : "—"}
                  </td>
                  <td className="score-nums px-3 py-2 text-slate-400">{r.catches}</td>
                  <td className="max-w-44 truncate px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#22c55e]">
                    {r.result ?? "—"}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    No match data yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* auction history */}
        {auctionHistory.length > 0 && (
          <>
            <SectionHeading index="03" title="Auction history" className="mt-10" />
            <div className="mt-4 overflow-x-auto border border-border bg-card panel-glow">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-[#0b1524] text-[9px] font-bold uppercase tracking-widest text-slate-500">
                    <th className="px-3 py-2">Room</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {auctionHistory.map((a, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-bold text-slate-100">{a.room}</td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            a.sold
                              ? "bg-[#22c55e]/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[#22c55e]"
                              : "bg-[#ef4444]/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[#ef4444]"
                          }
                        >
                          {a.sold ? "SOLD" : "UNSOLD"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-300">{a.team ?? "—"}</td>
                      <td className="score-nums px-3 py-2 text-[#facc15]">
                        ₹{a.price >= 100 ? `${(a.price / 100).toFixed(1)} Cr` : `${a.price}L`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "gold" | "cyan" | "green" | "red";
}) {
  const colors: Record<string, string> = {
    slate: "text-slate-200",
    gold: "text-[#facc15]",
    cyan: "text-[#22d3ee]",
    green: "text-[#22c55e]",
    red: "text-[#ef4444]",
  };
  return (
    <div className="border border-border bg-card px-4 py-3 panel-glow">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`score-nums mt-1 text-2xl font-black ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function StatRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{k}</span>
      <span className="score-nums text-sm font-bold text-slate-100">{v}</span>
    </div>
  );
}
