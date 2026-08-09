import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { BallChip, MicroLabel } from "@/components/swiss";
import { formatOvers } from "@/lib/vpl";
import { LogIn, ShieldCheck } from "lucide-react";

// ---- live ticker (Swiss railway-departure-board treatment) -----------------

export function LiveTicker() {
  const liveMatches = useQuery(api.matches.list, { status: "LIVE" });
  const liveMatch = liveMatches?.[0];
  const scorecard = useQuery(
    api.scorecard.get,
    liveMatch ? { matchId: liveMatch.id } : "skip",
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
    <div className="overflow-hidden border-y border-foreground bg-[#E4002B] text-white">
      <div className="ticker-track py-1.5">
        {loop.map((item, i) => (
          <span key={i} className="flex shrink-0 items-center gap-3 px-4">
            <span className="size-1.5 rounded-full bg-white" aria-hidden />
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
  { to: "/leaderboard", label: "Points & Stats" },
  { to: "/teams", label: "Teams" },
];

export function SiteHeader() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  return (
    <header className="sticky top-0 z-40 bg-white">
      <div className="h-1 bg-[#E4002B]" aria-hidden />
      <div className="border-b border-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="group flex items-center gap-2">
            <span className="flex size-8 items-center justify-center bg-[#E4002B] text-base font-extrabold text-white">
              V
            </span>
            <span className="text-lg font-extrabold uppercase leading-none tracking-tight">
              VPL<span className="text-[#002FA7]">·</span>CricHub
            </span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="micro-label border-b-2 border-transparent pb-1 text-foreground/70 transition-colors hover:border-[#E4002B] hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {!isLoading &&
              (isAuthenticated ? (
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-1.5 bg-foreground px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#E4002B]"
                >
                  <ShieldCheck className="size-3.5" />
                  {isAdmin ? "Admin" : "Scorer"}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate("/auth")}
                  className="inline-flex items-center gap-1.5 border border-foreground px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-white"
                >
                  <LogIn className="size-3.5" />
                  Sign in
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* mobile nav row */}
      <nav className="flex items-center gap-5 overflow-x-auto border-b border-foreground/15 px-4 py-2 md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="micro-label shrink-0 text-foreground/70 hover:text-foreground"
          >
            {n.label}
          </Link>
        ))}
        <Link
          to={isAuthenticated ? "/dashboard" : "/auth"}
          className="micro-label shrink-0 text-[#E4002B]"
        >
          {isAuthenticated ? "Admin" : "Sign in"}
        </Link>
      </nav>

      <LiveTicker />
    </header>
  );
}

// ---- footer ----------------------------------------------------------------

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-foreground text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center bg-[#E4002B] text-base font-extrabold text-white">
              V
            </span>
            <span className="text-base font-extrabold uppercase tracking-tight">
              VPL CricHub
            </span>
          </div>
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-white/60">
            The Vasavi Premiere League — village cricket, scored ball by ball and
            streamed live to every phone in the village.
          </p>
        </div>
        <div>
          <MicroLabel className="text-white/40">Explore</MicroLabel>
          <ul className="mt-3 space-y-2 text-xs font-bold uppercase tracking-widest">
            <li><Link className="hover:text-[#E4002B]" to="/matches">Live scores</Link></li>
            <li><Link className="hover:text-[#E4002B]" to="/leaderboard">Points table</Link></li>
            <li><Link className="hover:text-[#E4002B]" to="/teams">Teams &amp; squads</Link></li>
          </ul>
        </div>
        <div>
          <MicroLabel className="text-white/40">Scorers</MicroLabel>
          <ul className="mt-3 space-y-2 text-xs font-bold uppercase tracking-widest">
            <li><Link className="hover:text-[#E4002B]" to="/auth">Scorer sign-in</Link></li>
            <li><Link className="hover:text-[#E4002B]" to="/dashboard">Admin console</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/50">
          <span>© 2026 VPL CricHub</span>
          <span className="flex items-center gap-1.5">
            <BallChip symbol="6" kind="boundary" size="sm" />
            Village cricket. Live, ball by ball.
          </span>
        </div>
      </div>
    </footer>
  );
}
