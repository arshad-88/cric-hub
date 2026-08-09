import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SectionHeading, StatusPill } from "@/components/swiss";
import { cn } from "@/lib/utils";
import { formatDate, type TournamentStatus } from "@/lib/vpl";
import { ArrowRight, Calendar, MapPin, Users } from "lucide-react";

const FILTERS: { key: "ALL" | TournamentStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "UPCOMING", label: "Upcoming" },
  { key: "PAST", label: "Past" },
];

export default function Tournaments() {
  const [filter, setFilter] = useState<"ALL" | TournamentStatus>("ALL");
  const all = useQuery(api.tournaments.list);

  const tournaments = all ?? [];
  const filtered =
    filter === "ALL" ? tournaments : tournaments.filter((t) => t.status === filter);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
        <SectionHeading index="01" title="Tournament directory" className="mb-2" />
        <p className="mb-6 text-xs uppercase tracking-widest text-slate-500">
          Every league on the platform — active, upcoming and past
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
                  ? "border-[#22c55e] bg-[#22c55e] text-[#052e16]"
                  : "border-border bg-card text-slate-400 hover:text-white",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="border border-border bg-card px-4 py-14 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
            No tournaments in this bucket yet
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <TournamentCardRow key={t.id} id={t.id} data={t} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function TournamentCardRow({
  id,
  data,
}: {
  id: string;
  data: {
    name: string;
    year: number;
    description?: string;
    city?: string;
    ballType?: string;
    startDate?: number;
    endDate?: number;
    bannerUrl?: string;
    status: TournamentStatus;
    teamsCount: number;
    matchesCount: number;
    completedCount: number;
    liveMatchId?: string | null;
  };
}) {
  const href = data.liveMatchId
    ? `/matches/${data.liveMatchId}`
    : `/matches?tournament=${id}`;
  const status = data.status as "ACTIVE" | "UPCOMING" | "PAST";

  return (
    <Link
      to={href}
      className="group flex flex-col border border-border bg-card transition-all hover:border-[#22c55e]/70 hover:glow-green"
    >
      {/* banner */}
      <div
        className="relative flex h-28 items-end overflow-hidden border-b border-border bg-[#0b1524] p-3"
        style={
          data.bannerUrl
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(11,21,36,0.1), rgba(11,21,36,0.9)), url(${data.bannerUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="absolute right-3 top-3">
          <StatusPill status={status === "ACTIVE" ? "LIVE" : status === "UPCOMING" ? "UPCOMING" : "COMPLETED"} />
        </div>
        <div>
          <p className="text-lg font-black uppercase leading-tight tracking-tight text-white">
            {data.name}
            <span className="ml-1.5 text-slate-400">{data.year}</span>
          </p>
          {data.description && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{data.description}</p>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3 p-4">
        <div className="space-y-1.5 text-[11px] font-medium text-slate-400">
          {data.city && (
            <p className="flex items-center gap-1.5">
              <MapPin className="size-3 text-[#22d3ee]" /> {data.city}
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <Calendar className="size-3 text-[#facc15]" />
            {data.startDate ? formatDate(data.startDate) : "Dates TBA"}
            {data.endDate ? ` — ${formatDate(data.endDate)}` : ""}
          </p>
          <p className="flex items-center gap-1.5">
            <Users className="size-3 text-[#22c55e]" /> {data.teamsCount} teams · {data.matchesCount} matches · {data.ballType ?? "Mixed"} ball
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#22c55e]">
          View fixtures <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
        </p>
      </div>
    </Link>
  );
}
