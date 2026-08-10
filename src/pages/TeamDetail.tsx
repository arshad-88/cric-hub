import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useParams, Link } from "react-router";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { MicroLabel, StatusPill, TeamMark } from "@/components/swiss";
import { formatDate } from "@/lib/format";
import { ArrowLeft } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

const roleStyles: Record<string, string> = {
  Batsman: "bg-[#22d3ee] text-[#083344]",
  Bowler: "bg-[#facc15] text-[#422006]",
  "All-rounder": "bg-[#22c55e] text-[#052e16]",
};

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery(api.teams.getDetail, id ? { teamId: id as Id<"teams"> } : "skip");

  if (detail === undefined) {
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

  if (detail === null) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-20">
          <p className="border border-border bg-card px-4 py-14 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
            Team not found
          </p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const { team, players, matches } = detail;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Link
          to="/teams"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-[#22d3ee]"
        >
          <ArrowLeft className="size-3.5" /> All teams
        </Link>

        <div className="mt-6 flex items-center gap-4 border border-border bg-card px-5 py-6 panel-glow">
          <TeamMark shortCode={team.shortCode} color={team.color} size="lg" />
          <div>
            <h1 className="text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">
              {team.name}
            </h1>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              {detail.tournament?.name ?? "League"} · {players.length} players
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <MicroLabel className="mb-3 block">Squad</MicroLabel>
            <ul className="divide-y divide-border/60 border border-border bg-card panel-glow">
              {players.map((p) => (
                <li key={p._id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    {p.jerseyNumber != null && (
                      <span className="score-nums text-[10px] font-black text-slate-500">
                        #{p.jerseyNumber}
                      </span>
                    )}
                    <span className="truncate text-sm font-bold text-slate-100">{p.name}</span>
                  </span>
                  <span
                    className={`shrink-0 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest ${roleStyles[p.role]}`}
                  >
                    {p.role}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <MicroLabel className="mb-3 block">Recent matches</MicroLabel>
            {matches.length === 0 ? (
              <p className="border border-border bg-card px-4 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                No matches scheduled yet
              </p>
            ) : (
              <ul className="divide-y divide-border/60 border border-border bg-card panel-glow">
                {matches.map((m) => (
                  <li key={m.id}>
                    <Link
                      to={`/matches/${m.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#22c55e]/[0.05]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">
                          {m.opponent ? `vs ${m.opponent.name}` : "vs TBD"}
                        </span>
                        <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                          {m.stage ?? "Match"} · {formatDate(m.startTime)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {m.result && (
                          <span className="max-w-40 truncate text-[10px] font-bold uppercase tracking-wider text-[#22c55e]">
                            {m.result}
                          </span>
                        )}
                        <StatusPill status={m.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
