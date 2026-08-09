import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SectionHeading, TeamMark } from "@/components/swiss";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";

export default function Teams() {
  const teams = useQuery(api.teams.listActive);
  const active = useQuery(api.tournaments.getActive);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
        <SectionHeading
          index="01"
          title={active ? `${active.name} — Teams` : "Teams"}
          className="mb-8"
        />
        {teams === undefined ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse border border-border bg-card" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <p className="border border-border bg-card px-4 py-14 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
            Squads will be announced soon
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {teams.map((t) => (
              <Link
                key={t._id}
                to={`/teams/${t._id}`}
                className="group border border-border bg-card p-5 transition-all hover:border-[#22c55e]/70 hover:glow-green"
              >
                <div className="flex items-center justify-between">
                  <TeamMark shortCode={t.shortCode} color={t.color} size="lg" />
                  <ArrowRight className="size-4 text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-[#22c55e]" />
                </div>
                <h2 className="mt-4 text-base font-extrabold uppercase tracking-tight text-white">
                  {t.name}
                </h2>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {t.shortCode} · Squad &amp; results
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
