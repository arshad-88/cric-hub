import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { MatchCard } from "@/components/MatchCard";
import { SectionHeading } from "@/components/swiss";
import { cn } from "@/lib/utils";

type MatchStatus = "UPCOMING" | "LIVE" | "COMPLETED";

const FILTERS: { key: "ALL" | MatchStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "LIVE", label: "Live" },
  { key: "UPCOMING", label: "Upcoming" },
  { key: "COMPLETED", label: "Completed" },
];

export default function Matches() {
  const [filter, setFilter] = useState<"ALL" | MatchStatus>("ALL");
  const all = useQuery(api.matches.list, {});
  const tournament = useQuery(api.tournaments.getActive);

  const matches = all ?? [];
  const filtered =
    filter === "ALL" ? matches : matches.filter((m) => m.status === filter);

  const liveCount = matches.filter((m) => m.status === "LIVE").length;
  const upcomingCount = matches.filter((m) => m.status === "UPCOMING").length;
  const completedCount = matches.filter((m) => m.status === "COMPLETED").length;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <SectionHeading
          index="01"
          title={tournament ? `${tournament.name} — Fixtures` : "Fixtures"}
          className="mb-2"
        />
        <p className="mb-6 text-xs uppercase tracking-widest text-foreground/55">
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
                    ? "border-[#E4002B] bg-[#E4002B] text-white"
                    : "border-foreground bg-foreground text-white"
                  : "border-foreground bg-white text-foreground/60 hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="border border-foreground bg-white px-4 py-14 text-center text-xs font-bold uppercase tracking-widest text-foreground/40">
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
