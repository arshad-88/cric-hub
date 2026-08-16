import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { MatchCard } from "@/components/MatchCard";
import { SectionHeading } from "@/components/swiss";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";

type MatchStatus = "UPCOMING" | "LIVE" | "COMPLETED";

const FILTERS: { key: "ALL" | MatchStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "LIVE", label: "Live" },
  { key: "UPCOMING", label: "Upcoming" },
  { key: "COMPLETED", label: "Completed" },
];

export default function Matches() {
  // test {
  const [searchParams] = useSearchParams();
  const tournamentParam = searchParams.get("tournament");
  const [filter, setFilter] = useState<"ALL" | MatchStatus>("ALL");
  const all = useQuery(
    api.matches.list,
    tournamentParam
      ? { tournamentId: tournamentParam as Id<"tournaments"> }
      : {},
  );
  const tournaments = useQuery(api.tournaments.list);
  const activeTournament = useQuery(api.tournaments.getActive);

  const matches = all ?? [];
  const filtered =
    filter === "ALL" ? matches : matches.filter((m) => m.status === filter);

  const liveCount = matches.filter((m) => m.status === "LIVE").length;
  const upcomingCount = matches.filter((m) => m.status === "UPCOMING").length;
  const completedCount = matches.filter((m) => m.status === "COMPLETED").length;

  const selected = tournamentParam
    ? tournaments?.find((t) => t.id === tournamentParam)
    : null;
  const heading = selected
    ? `${selected.name} — Fixtures`
    : activeTournament
      ? `${activeTournament.name} — Fixtures`
      : "Fixtures";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
        <SectionHeading index="01" title={heading} className="mb-2" />
        <p className="mb-6 text-xs uppercase tracking-widest text-slate-500">
          {liveCount} live · {upcomingCount} upcoming · {completedCount} completed
        </p>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "micro-label border px-3 py-2 transition-colors",
                filter === f.key
                  ? f.key === "LIVE"
                    ? "border-[#ef4444] bg-[#ef4444] text-white"
                    : "border-[#22c55e] bg-[#22c55e] text-[#052e16]"
                  : "border-border bg-card text-slate-400 hover:text-white",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="border border-border bg-card px-4 py-14 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
            No {filter === "ALL" ? "" : filter.toLowerCase() + " "}matches yet
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
