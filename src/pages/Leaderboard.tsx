import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { PointsTable } from "@/components/PointsTable";
import { MicroLabel, SectionHeading, TeamMark } from "@/components/swiss";
import { Trophy } from "lucide-react";

export default function Leaderboard() {
  const data = useQuery(api.leaderboard.get);
  const tournament = useQuery(api.tournaments.getActive);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <SectionHeading
          index="01"
          title={tournament ? `${tournament.name} — Table` : "Points & Stats"}
          className="mb-8"
        />

        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <MicroLabel className="mb-3 block text-[#002FA7]">
              Points table — P W L T · NRR · Pts
            </MicroLabel>
            {data === undefined ? (
              <div className="h-40 animate-pulse border border-foreground bg-white" />
            ) : (
              <PointsTable rows={data?.pointsTable ?? []} />
            )}
            <p className="mt-2 text-[10px] uppercase tracking-widest text-foreground/45">
              Win = 2 pts · Tie = 1 pt · NRR uses full allocation for all-out innings
            </p>
          </div>

          <div className="space-y-8">
            {/* orange cap */}
            <div>
              <MicroLabel className="mb-3 flex items-center gap-1.5 text-[#E4002B]">
                <Trophy className="size-3.5" /> Orange cap — run leaders
              </MicroLabel>
              <div className="border border-foreground bg-white">
                <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-foreground bg-[#E4002B] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white">
                  <span>Player · Team</span>
                  <span className="score-nums">R&nbsp;B&nbsp;4s&nbsp;6s&nbsp;SR&nbsp;Inns</span>
                </div>
                <ul className="divide-y divide-foreground/10">
                  {(data?.topBatters ?? []).map((b, i) => (
                    <li key={b.playerId} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="score-nums w-4 text-[10px] font-extrabold text-foreground/40">
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{b.name}</span>
                          <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-foreground/50">
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
                      <span className="score-nums whitespace-nowrap text-xs font-semibold">
                        {b.runs}&nbsp;&nbsp;{b.balls}&nbsp;&nbsp;{b.fours}&nbsp;&nbsp;{b.sixes}
                        &nbsp;&nbsp;{b.sr}&nbsp;&nbsp;{b.innings}
                      </span>
                    </li>
                  ))}
                  {(data?.topBatters ?? []).length === 0 && (
                    <li className="px-3 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-foreground/40">
                      No innings completed yet
                    </li>
                  )}
                </ul>
              </div>
            </div>

            {/* purple cap */}
            <div>
              <MicroLabel className="mb-3 flex items-center gap-1.5 text-[#002FA7]">
                <Trophy className="size-3.5" /> Purple cap — wicket takers
              </MicroLabel>
              <div className="border border-foreground bg-white">
                <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-foreground bg-[#002FA7] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white">
                  <span>Player · Team</span>
                  <span className="score-nums">W&nbsp;R&nbsp;O&nbsp;M&nbsp;Econ</span>
                </div>
                <ul className="divide-y divide-foreground/10">
                  {(data?.topBowlers ?? []).map((b, i) => (
                    <li key={b.playerId} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="score-nums w-4 text-[10px] font-extrabold text-foreground/40">
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{b.name}</span>
                          <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-foreground/50">
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
                      <span className="score-nums whitespace-nowrap text-xs font-semibold">
                        {b.wickets}&nbsp;&nbsp;{b.runs}&nbsp;&nbsp;{b.overs}&nbsp;&nbsp;
                        {b.maidens}&nbsp;&nbsp;{b.econ}
                      </span>
                    </li>
                  ))}
                  {(data?.topBowlers ?? []).length === 0 && (
                    <li className="px-3 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-foreground/40">
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
