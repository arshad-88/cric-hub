import { StatusPill, TeamMark } from "@/components/swiss";
import { formatDate, formatTime, type MatchRow } from "@/lib/vpl";
import { Link } from "react-router";
import { Calendar, MapPin, Play } from "lucide-react";

export function MatchCard({ match }: { match: MatchRow }) {
  const live = match.status === "LIVE";
  const first = match.teamA;
  const second = match.teamB;
  return (
    <Link
      to={`/matches/${match.id}`}
      className="group block border border-border bg-card transition-all hover:border-[#22c55e]/70 hover:glow-green"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="micro-label text-slate-500">
          {match.stage ?? "Match"} · {formatDate(match.startTime)}
        </span>
        <StatusPill status={match.status} />
      </div>

      <div className="px-3 py-3">
        {first && (
          <div className="flex items-center gap-2.5 py-1">
            <TeamMark shortCode={first.shortCode} color={first.color} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100">
              {first.name}
            </span>
            {live && <Play className="size-3 text-[#ef4444]" />}
          </div>
        )}
        {second && (
          <div className="flex items-center gap-2.5 py-1">
            <TeamMark shortCode={second.shortCode} color={second.color} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100">
              {second.name}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-border px-3 py-2">
        {match.result ? (
          <p className="truncate text-[11px] font-bold uppercase tracking-wider text-[#22c55e]">
            {match.result}
          </p>
        ) : match.inningsSummary ? (
          <p className="score-nums truncate text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {match.inningsSummary}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <Calendar className="size-3" />
            {formatDate(match.startTime)} · {formatTime(match.startTime)}
            {match.venue && (
              <>
                <span className="text-slate-700">|</span>
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
