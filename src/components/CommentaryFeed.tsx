import { BallChip, MicroLabel } from "@/components/swiss";
import type { BallView } from "@/lib/vpl";
import { MessageSquareText } from "lucide-react";

export function CommentaryFeed({ balls }: { balls: BallView[] }) {
  if (balls.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 border border-foreground bg-white px-4 py-10 text-center">
        <MessageSquareText className="size-6 text-foreground/30" />
        <p className="text-xs font-bold uppercase tracking-widest text-foreground/50">
          Ball-by-ball commentary starts when the first ball is bowled
        </p>
      </div>
    );
  }
  return (
    <div className="border border-foreground bg-white">
      <div className="flex items-center justify-between border-b border-foreground bg-foreground px-3 py-2 text-white">
        <MicroLabel className="text-white">Ball-by-ball</MicroLabel>
        <MicroLabel className="text-white/70">{balls.length} balls</MicroLabel>
      </div>
      <ul className="max-h-[26rem] divide-y divide-foreground/10 overflow-y-auto">
        {balls.map((b, i) => (
          <li
            key={b.key}
            className={
              i === 0
                ? "flex items-start gap-2.5 bg-[#E4002B]/[0.06] px-3 py-2"
                : "flex items-start gap-2.5 px-3 py-2"
            }
          >
            <span className="score-nums w-9 shrink-0 pt-0.5 text-right text-[10px] font-bold tabular-nums text-foreground/45">
              {b.overLabel}
            </span>
            <BallChip symbol={b.symbol} kind={b.kind} size="sm" className="mt-0.5" />
            <p className="min-w-0 flex-1 text-[13px] leading-snug">
              {b.text}
              {i === 0 && (
                <span className="ml-2 bg-[#E4002B] px-1 text-[8px] font-extrabold uppercase tracking-widest text-white">
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
