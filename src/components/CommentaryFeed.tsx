import { BallChip, MicroLabel } from "@/components/swiss";
import type { BallView } from "@/lib/format";
import { MessageSquareText } from "lucide-react";

export function CommentaryFeed({ balls }: { balls: BallView[] }) {
  if (balls.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 border border-border bg-card px-4 py-10 text-center panel-glow">
        <MessageSquareText className="size-6 text-slate-600" />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Ball-by-ball commentary starts with the first ball
        </p>
      </div>
    );
  }
  return (
    <div className="border border-border bg-card panel-glow">
      <div className="flex items-center justify-between border-b border-border bg-[#0b1524] px-3 py-2">
        <MicroLabel className="text-[#22c55e]">Ball-by-ball</MicroLabel>
        <MicroLabel className="text-slate-500">{balls.length} balls</MicroLabel>
      </div>
      <ul className="max-h-[26rem] divide-y divide-border/60 overflow-y-auto">
        {balls.map((b, i) => (
          <li
            key={b.key}
            className={
              i === 0
                ? "flex items-start gap-2.5 bg-[#ef4444]/[0.07] px-3 py-2"
                : "flex items-start gap-2.5 px-3 py-2"
            }
          >
            <span className="score-nums w-9 shrink-0 pt-0.5 text-right text-[10px] font-bold tabular-nums text-slate-500">
              {b.overLabel}
            </span>
            <BallChip symbol={b.symbol} kind={b.kind} size="sm" className="mt-0.5" />
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-slate-200">
              {b.text}
              {i === 0 && (
                <span className="ml-2 bg-[#ef4444] px-1 text-[8px] font-extrabold uppercase tracking-widest text-white">
                  New
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
