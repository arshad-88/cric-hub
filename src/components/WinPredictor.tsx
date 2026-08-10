import { MicroLabel, TeamMark } from "@/components/swiss";
import type { TeamLite } from "@/lib/format";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export interface Prediction {
  teamA: number;
  teamB: number;
  summary: string;
  projected?: number;
}

/**
 * Broadcast-style win-probability strip (like ESPNcricinfo's predictor).
 * Animates as the ball-by-ball score changes; green = team A, gold = team B.
 */
export function WinPredictor({
  prediction,
  teamA,
  teamB,
  status,
  superOver,
}: {
  prediction: Prediction;
  teamA: TeamLite;
  teamB: TeamLite;
  status: "UPCOMING" | "LIVE" | "COMPLETED";
  superOver?: boolean;
}) {
  const a = Math.round(prediction.teamA);
  const b = Math.round(prediction.teamB);
  const favoriteA = a > b;
  const decided = status === "COMPLETED" || a === 100 || b === 100;

  return (
    <div
      className={cn(
        "border border-border bg-card px-4 py-3 panel-glow",
        status === "LIVE" && !superOver && "border-[#22c55e]/40",
        superOver && "border-[#facc15]/60",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <MicroLabel className={cn(status === "LIVE" && !superOver ? "text-[#22c55e]" : "text-slate-500")}>
          {superOver ? "Super Over predictor" : "Match outcome predictor"}
        </MicroLabel>
        {prediction.projected != null && (
          <span className="score-nums micro-label text-[#22d3ee]">
            Projected {prediction.projected}
          </span>
        )}
      </div>

      {/* teams + probabilities */}
      <div className="mt-2.5 flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-sm font-extrabold uppercase tracking-tight",
                decided && favoriteA ? "text-[#22c55e]" : "text-white",
              )}
            >
              {teamA.name}
            </p>
            <p
              className={cn(
                "score-nums text-xl font-black leading-none",
                decided && favoriteA ? "text-[#22c55e] led-green" : "text-slate-300",
              )}
            >
              {a}%
            </p>
          </div>
          <TeamMark shortCode={teamA.shortCode} color={teamA.color} />
        </div>

        <div className="w-24 shrink-0 text-center">
          <MicroLabel className="text-slate-600">vs</MicroLabel>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TeamMark shortCode={teamB.shortCode} color={teamB.color} />
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-sm font-extrabold uppercase tracking-tight",
                decided && !favoriteA ? "text-[#facc15]" : "text-white",
              )}
            >
              {teamB.name}
            </p>
            <p
              className={cn(
                "score-nums text-xl font-black leading-none",
                decided && !favoriteA ? "text-[#facc15] led-gold" : "text-slate-300",
              )}
            >
              {b}%
            </p>
          </div>
        </div>
      </div>

      {/* probability bar */}
      <div className="mt-3 flex h-2.5 w-full overflow-hidden border border-border bg-[#0b1524]">
        <motion.div
          className="h-full bg-[#22c55e]"
          initial={false}
          animate={{ width: `${a}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
        <motion.div
          className="h-full flex-1 bg-[#facc15]"
          initial={false}
          animate={{ width: `${b}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
      {/* marker for the favorite */}
      <div className="mt-1 flex justify-between score-nums text-[9px] font-bold uppercase tracking-widest">
        <span className={favoriteA ? "text-[#22c55e]" : "text-slate-600"}>
          {teamA.shortCode} {decided ? (favoriteA ? "· winner" : "") : "· fav"}
        </span>
        <span className={!favoriteA ? "text-[#facc15]" : "text-slate-600"}>
          {decided ? (!favoriteA ? "· winner" : "") : "· fav"} {teamB.shortCode}
        </span>
      </div>

      <p className="mt-2 border-t border-border/60 pt-2 text-[11px] font-medium text-slate-400">
        {prediction.summary}
      </p>
    </div>
  );
}
