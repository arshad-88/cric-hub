import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SectionHeading, TeamMark } from "@/components/swiss";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";

export default function Teams() {
  const teams = useQuery(api.teams.listActive);
  const tournament = useQuery(api.tournaments.getActive);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <SectionHeading
          index="01"
          title={tournament ? `${tournament.name} — Teams` : "Teams"}
          className="mb-8"
        />
        {teams === undefined ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse border border-foreground bg-white" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <p className="border border-foreground bg-white px-4 py-14 text-center text-xs font-bold uppercase tracking-widest text-foreground/40">
            Squads will be announced soon
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {teams.map((t) => (
              <Link
                key={t._id}
                to={`/teams/${t._id}`}
                className="group border border-foreground bg-white p-5 transition-shadow hover:shadow-[6px_6px_0_0_rgba(228,0,43,1)]"
              >
                <div className="flex items-center justify-between">
                  <TeamMark shortCode={t.shortCode} color={t.color} size="lg" />
                  <ArrowRight className="size-4 text-foreground/30 transition-transform group-hover:translate-x-1 group-hover:text-[#E4002B]" />
                </div>
                <h2 className="mt-4 text-base font-extrabold uppercase tracking-tight">
                  {t.name}
                </h2>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-foreground/45">
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
