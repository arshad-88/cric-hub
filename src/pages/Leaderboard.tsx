import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { PointsTable } from "@/components/PointsTable";
import { MicroLabel, SectionHeading, TeamMark } from "@/components/swiss";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trophy } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

export default function Leaderboard() {
  const tournaments = useQuery(api.tournaments.list);
  const active = useQuery(api.tournaments.getActive);
  const [tournamentId, setTournamentId] = useState<string>("");

  const resolvedId =
    tournamentId || active?._id || tournaments?.[0]?.id || "";
  const data = useQuery(
    api.leaderboard.get,
    resolvedId ? { tournamentId: resolvedId as Id<"tournaments"> } : "skip",
  );
  const selected =
    tournaments?.find((t) => t.id === resolvedId) ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index="01"
            title={selected ? `${selected.name} — Stats` : "Points & Stats"}
            className="flex-1"
          />
          <div className="w-64">
            <Select value={resolvedId || undefined} onValueChange={setTournamentId}>
              <SelectTrigger className="rounded-none border-border bg-card text-xs uppercase tracking-wider text-slate-200">
                <SelectValue placeholder="Tournament" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border bg-card">
                {(tournaments ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <MicroLabel className="mb-3 block text-[#facc15]">
              Points table — P W L T · NRR · Pts
            </MicroLabel>
            {data === undefined ? (
              <div className="h-40 animate-pulse border border-border bg-card" />
            ) : (
              <PointsTable rows={data?.pointsTable ?? []} />
            )}
            <p className="mt-2 text-[10px] uppercase tracking-widest text-slate-600">
              Win = 2 pts · Tie = 1 pt · NRR uses full allocation for all-out innings
            </p>
          </div>

          <div className="space-y-8">
            <div>
              <MicroLabel className="mb-3 flex items-center gap-1.5 text-[#facc15]">
                <Trophy className="size-3.5" /> Orange cap — run leaders
              </MicroLabel>
              <div className="border border-border bg-card panel-glow">
                <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-border bg-[#422006] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-[#facc15]">
                  <span>Player · Team</span>
                  <span className="score-nums">R&nbsp;B&nbsp;4s&nbsp;6s&nbsp;SR&nbsp;Inns</span>
                </div>
                <ul className="divide-y divide-border/60">
                  {(data?.topBatters ?? []).map((b, i) => (
                    <li key={b.playerId} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="score-nums w-4 text-[10px] font-extrabold text-slate-500">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-slate-100">{b.name}</span>
                          <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            {b.team ? (
                              <span className="flex items-center gap-1">
                                <TeamMark shortCode={b.team.shortCode} color={b.team.color} size="sm" />
                                {b.team.name}
                              </span>
                            ) : (
                              "—"
                            )}
                          </span>
                        </span>
                      </span>
                      <span className="score-nums whitespace-nowrap text-xs font-semibold text-slate-200">
                        {b.runs}&nbsp;&nbsp;{b.balls}&nbsp;&nbsp;{b.fours}&nbsp;&nbsp;{b.sixes}
                        &nbsp;&nbsp;{b.sr}&nbsp;&nbsp;{b.innings}
                      </span>
                    </li>
                  ))}
                  {(data?.topBatters ?? []).length === 0 && (
                    <li className="px-3 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      No innings completed yet
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div>
              <MicroLabel className="mb-3 flex items-center gap-1.5 text-[#22d3ee]">
                <Trophy className="size-3.5" /> Purple cap — wicket takers
              </MicroLabel>
              <div className="border border-border bg-card panel-glow">
                <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-border bg-[#083344] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-[#22d3ee]">
                  <span>Player · Team</span>
                  <span className="score-nums">W&nbsp;R&nbsp;O&nbsp;M&nbsp;Econ</span>
                </div>
                <ul className="divide-y divide-border/60">
                  {(data?.topBowlers ?? []).map((b, i) => (
                    <li key={b.playerId} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="score-nums w-4 text-[10px] font-extrabold text-slate-500">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-slate-100">{b.name}</span>
                          <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            {b.team ? (
                              <span className="flex items-center gap-1">
                                <TeamMark shortCode={b.team.shortCode} color={b.team.color} size="sm" />
                                {b.team.name}
                              </span>
                            ) : (
                              "—"
                            )}
                          </span>
                        </span>
                      </span>
                      <span className="score-nums whitespace-nowrap text-xs font-semibold text-slate-200">
                        {b.wickets}&nbsp;&nbsp;{b.runs}&nbsp;&nbsp;{b.overs}&nbsp;&nbsp;
                        {b.maidens}&nbsp;&nbsp;{b.econ}
                      </span>
                    </li>
                  ))}
                  {(data?.topBowlers ?? []).length === 0 && (
                    <li className="px-3 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      No wickets yet
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
