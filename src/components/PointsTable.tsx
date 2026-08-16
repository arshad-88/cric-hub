import { TeamMark } from "@/components/swiss";
import type { PointsRow } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PointsTable({ rows }: { rows: PointsRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="border border-border bg-card px-4 py-8 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
        No completed matches yet
      </p>
    );
  }
  return (
    <div className="border border-border bg-card panel-glow">
      <div className="grid grid-cols-[1fr_repeat(6,minmax(0,auto))] items-center gap-x-3 border-b border-border bg-panel px-3 py-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Team</span>
        {["P", "W", "L", "T", "NRR", "Pts"].map((h) => (
          <span
            key={h}
            className="score-nums w-8 text-right text-[9px] font-bold uppercase tracking-widest text-slate-400"
          >
            {h}
          </span>
        ))}
      </div>
      <ul>
        {rows.map((r, i) => (
          <li
            key={r.team._id}
            className={cn(
              "grid grid-cols-[1fr_repeat(6,minmax(0,auto))] items-center gap-x-3 border-b border-border/60 px-3 py-2 last:border-0",
              i === 0 && "bg-[#22c55e]/[0.06]",
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="score-nums w-4 text-[10px] font-extrabold text-slate-500">
                {i + 1}
              </span>
              <TeamMark shortCode={r.team.shortCode} color={r.team.color} size="sm" />
              <span className="truncate text-sm font-bold text-slate-100">{r.team.name}</span>
            </span>
            <span className="score-nums w-8 text-right text-xs font-semibold text-slate-300">{r.played}</span>
            <span className="score-nums w-8 text-right text-xs font-semibold text-[#22c55e]">{r.won}</span>
            <span className="score-nums w-8 text-right text-xs font-semibold text-slate-400">{r.lost}</span>
            <span className="score-nums w-8 text-right text-xs font-semibold text-slate-400">{r.tied}</span>
            <span className="score-nums w-8 text-right text-xs font-semibold text-slate-500">
              {r.nrr.toFixed(3)}
            </span>
            <span
              className={cn(
                "score-nums w-8 text-right text-sm font-extrabold",
                i < 2 ? "text-[#facc15] led-gold" : "text-slate-100",
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
