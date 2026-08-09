import { TeamMark } from "@/components/swiss";
import type { PointsRow } from "@/lib/vpl";
import { cn } from "@/lib/utils";

export function PointsTable({ rows }: { rows: PointsRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="border border-foreground bg-white px-4 py-8 text-center text-xs font-bold uppercase tracking-widest text-foreground/40">
        No completed matches yet
      </p>
    );
  }
  return (
    <div className="border border-foreground bg-white">
      <div className="grid grid-cols-[1fr_repeat(6,minmax(0,auto))] items-center gap-x-3 border-b border-foreground bg-foreground px-3 py-2 text-white">
        <span className="text-[9px] font-bold uppercase tracking-widest">Team</span>
        {["P", "W", "L", "T", "NRR", "Pts"].map((h) => (
          <span
            key={h}
            className="score-nums w-8 text-right text-[9px] font-bold uppercase tracking-widest"
          >
            {h}
          </span>
        ))}
      </div>
      <ul>
        {rows.map((r, i) => (
          <li
            key={r.team.id}
            className={cn(
              "grid grid-cols-[1fr_repeat(6,minmax(0,auto))] items-center gap-x-3 border-b border-foreground/10 px-3 py-2 last:border-0",
              i === 0 && "bg-foreground/[0.04]",
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="score-nums w-4 text-[10px] font-extrabold text-foreground/40">
                {i + 1}
              </span>
              <TeamMark shortCode={r.team.shortCode} color={r.team.color} size="sm" />
              <span className="truncate text-sm font-bold">{r.team.name}</span>
            </span>
            <span className="score-nums w-8 text-right text-xs font-semibold">{r.played}</span>
            <span className="score-nums w-8 text-right text-xs font-semibold">{r.won}</span>
            <span className="score-nums w-8 text-right text-xs font-semibold">{r.lost}</span>
            <span className="score-nums w-8 text-right text-xs font-semibold">{r.tied}</span>
            <span className="score-nums w-8 text-right text-xs font-semibold text-foreground/60">
              {r.nrr.toFixed(3)}
            </span>
            <span
              className={cn(
                "score-nums w-8 text-right text-sm font-extrabold",
                i < 2 ? "text-[#002FA7]" : "text-foreground",
              )}
            >
              {r.points}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
