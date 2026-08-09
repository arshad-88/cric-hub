import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { BallChip, MicroLabel } from "@/components/swiss";
import { formatOvers } from "@/lib/vpl";
import { LogIn, Plus } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

// ---- live ticker (LED departure-board marquee) -----------------------------

export function LiveTicker() {
  const liveMatches = useQuery(api.matches.list, { status: "LIVE" });
  const liveMatch = liveMatches?.[0];
  const scorecard = useQuery(
    api.scorecard.get,
    liveMatch ? { matchId: liveMatch.id as Id<"matches"> } : "skip",
  );

  const items: string[] = [];
  if (scorecard) {
    for (const inn of scorecard.innings) {
      items.push(
        `${inn.battingTeam.shortCode} ${inn.totalRuns}/${inn.wickets} (${formatOvers(inn.ballsBowled)})`,
      );
    }
    const latest = scorecard.currentInnings?.commentary[0];
    if (latest) items.push(latest.text);
    if (scorecard.match.streamUrl) items.push("LIVE STREAM: ON AIR");
  }

  if (items.length === 0) return null;

  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden border-b border-border bg-[#ef4444] text-white">
      <div className="ticker-track py-1.5">
        {loop.map((item, i) => (
          <span key={i} className="flex shrink-0 items-center gap-3 px-4">
            <span className="size-1.5 rounded-full bg-white/70" aria-hidden />
            <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-widest">
              {item}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- header ----------------------------------------------------------------

const NAV = [
  { to: "/matches", label: "Matches" },
  { to: "/tournaments", label: "Tournaments" },
  { to: "/leaderboard", label: "Points & Stats" },
  { to: "/teams", label: "Teams" },
];

export function SiteHeader() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[#0b1524]/95 backdrop-blur">
      <div className="h-0.5 bg-gradient-to-r from-[#22c55e] via-[#facc15] to-[#22d3ee]" aria-hidden />
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="group flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-lg font-black text-[#052e16] led-green">
            C
          </span>
          <span className="text-xl font-black uppercase leading-none tracking-tight text-white">
            Cric<span className="text-[#22c55e] led-green">Pulse</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="micro-label border-b-2 border-transparent pb-1 text-slate-400 transition-colors hover:border-[#22c55e] hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {!isLoading &&
            (isAuthenticated ? (
              <>
                <span className="micro-label hidden max-w-36 truncate text-slate-500 md:inline">
                  {user?.name ?? "Signed in"}
                </span>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-1.5 bg-[#22c55e] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#052e16] transition-colors hover:bg-[#facc15] hover:text-[#422006]"
                >
                  <Plus className="size-3.5" />
                  My Hub
                </Link>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate("/auth")}
                  className="inline-flex items-center gap-1.5 border border-border bg-card px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-300 transition-colors hover:border-[#22c55e] hover:text-white"
                >
                  <LogIn className="size-3.5" />
                  Sign in
                </button>
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-1.5 bg-[#22c55e] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#052e16] transition-colors hover:bg-[#facc15] hover:text-[#422006]"
                >
                  <Plus className="size-3.5" />
                  Start a tournament
                </Link>
              </>
            ))}
        </div>
      </div>

      {/* mobile nav row */}
      <nav className="flex items-center gap-5 overflow-x-auto border-t border-border/60 px-4 py-2 md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="micro-label shrink-0 text-slate-400 hover:text-white"
          >
            {n.label}
          </Link>
        ))}
        <Link
          to={isAuthenticated ? "/dashboard" : "/auth"}
          className="micro-label shrink-0 text-[#22c55e]"
        >
          {isAuthenticated ? "My Hub" : "Sign in"}
        </Link>
      </nav>

      <LiveTicker />
    </header>
  );
}

// ---- footer ----------------------------------------------------------------

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-[#0b1524]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-base font-black text-[#052e16]">
              C
            </span>
            <span className="text-base font-black uppercase tracking-tight text-white">
              Cric<span className="text-[#22c55e]">Pulse</span>
            </span>
          </div>
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-slate-500">
            The community cricket broadcast platform — every league, scored
            ball by ball and streamed live to every phone in the crowd.
          </p>
        </div>
        <div>
          <MicroLabel className="text-slate-500">Spectators</MicroLabel>
          <ul className="mt-3 space-y-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <li><Link className="transition-colors hover:text-[#22c55e]" to="/matches">Live scores</Link></li>
            <li><Link className="transition-colors hover:text-[#22c55e]" to="/tournaments">Tournaments</Link></li>
            <li><Link className="transition-colors hover:text-[#22c55e]" to="/leaderboard">Points &amp; caps</Link></li>
            <li><Link className="transition-colors hover:text-[#22c55e]" to="/teams">Teams &amp; squads</Link></li>
          </ul>
        </div>
        <div>
          <MicroLabel className="text-slate-500">Organizers</MicroLabel>
          <ul className="mt-3 space-y-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <li><Link className="transition-colors hover:text-[#22c55e]" to="/auth">Sign in with your number</Link></li>
            <li><Link className="transition-colors hover:text-[#22c55e]" to="/dashboard">Start a tournament</Link></li>
            <li><Link className="transition-colors hover:text-[#22c55e]" to="/tournaments">Find a league to score</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">
          <span>© 2026 CricPulse</span>
          <span className="flex items-center gap-1.5">
            <BallChip symbol="6" kind="boundary" size="sm" />
            Community cricket. Broadcast live.
          </span>
        </div>
      </div>
    </footer>
  );
}
