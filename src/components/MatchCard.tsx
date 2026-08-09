import { StatusPill, TeamMark } from "@/components/swiss";
import { formatDate, formatTime, type MatchRow } from "@/lib/vpl";
import { Link } from "react-router";
import { Calendar, MapPin } from "lucide-react";

export function MatchCard({ match }: { match: MatchRow }) {
  const live = match.status === "LIVE";
  const first = match.teamA;
  const second = match.teamB;
  return (
    <Link
      to={`/matches/${match.id}`}
      className="group block border border-foreground bg-white transition-shadow hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-foreground px-3 py-1.5">
        <span className="micro-label text-foreground/55">
          {match.stage ?? "Match"} · {formatDate(match.startTime)}
        </span>
        <StatusPill status={match.status} />
      </div>

      <div className="px-3 py-3">
        {first && (
          <div className="flex items-center gap-2.5 py-1">
            <TeamMark shortCode={first.shortCode} color={first.color} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{first.name}</span>
            {live && <span className="score-nums text-sm font-extrabold text-[#E4002B]" />}
          </div>
        )}
        {second && (
          <div className="flex items-center gap-2.5 py-1">
            <TeamMark shortCode={second.shortCode} color={second.color} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{second.name}</span>
          </div>
        )}
      </div>

      <div className="border-t border-foreground px-3 py-2">
        {match.result ? (
          <p className="truncate text-[11px] font-bold uppercase tracking-wider text-[#E4002B]">
            {match.result}
          </p>
        ) : match.inningsSummary ? (
          <p className="score-nums truncate text-[11px] font-bold uppercase tracking-wider text-foreground/70">
            {match.inningsSummary}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/60">
            <Calendar className="size-3" />
            {formatDate(match.startTime)} · {formatTime(match.startTime)}
            {match.venue && (
              <>
                <span className="text-foreground/30">|</span>
                <MapPin className="size-3" />
                {match.venue}
              </>
            )}
          </p>
        )}
      </div>
    </Link>
  );
}
