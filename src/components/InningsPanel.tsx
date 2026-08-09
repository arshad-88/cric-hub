import { BallChip, MicroLabel, TeamMark } from "@/components/swiss";
import type { InningsView } from "@/lib/vpl";
import { cn } from "@/lib/utils";

function BallsRow({ innings }: { innings: InningsView }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-foreground px-3 py-2.5">
      <MicroLabel className="mr-1 text-[9px]">LAST 8</MicroLabel>
      {innings.recentBalls.length === 0 ? (
        <span className="text-[11px] font-medium text-foreground/50">
          No balls bowled yet
        </span>
      ) : (
        innings.recentBalls.map((b) => (
          <BallChip key={b.key} symbol={b.symbol} kind={b.kind} size="sm" />
        ))
      )}
    </div>
  );
}

function BattersTable({ innings }: { innings: InningsView }) {
  if (innings.batters.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-[11px] font-medium uppercase tracking-widest text-foreground/40">
        Batter yet to open
      </div>
    );
  }
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-foreground px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-foreground/50">
        <span>Batter</span>
        <span className="score-nums">R&nbsp;&nbsp;B&nbsp;&nbsp;4s&nbsp;&nbsp;6s&nbsp;&nbsp;SR</span>
      </div>
      <ul>
        {innings.batters.map((b) => (
          <li
            key={b.playerId}
            className={cn(
              "grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-b border-foreground/10 px-3 py-1.5",
              b.isStriker && "bg-foreground/[0.03]",
            )}
          >
            <div className="min-w-0">
              <span className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "truncate text-sm font-bold",
                    b.status === "out" && "text-foreground/50 line-through decoration-1",
                  )}
                >
                  {b.name}
                </span>
                {b.isStriker && (
                  <span className="shrink-0 bg-[#002FA7] px-1 text-[8px] font-extrabold uppercase tracking-wider text-white">
                    ●
                  </span>
                )}
                {b.isNonStriker && (
                  <span className="shrink-0 bg-foreground px-1 text-[8px] font-extrabold uppercase tracking-wider text-white">
                    ▲
                  </span>
                )}
              </span>
              {b.status === "out" && b.dismissalText && (
                <span className="block truncate text-[10px] italic text-foreground/45">
                  {b.dismissalText}
                </span>
              )}
            </div>
            <span className="score-nums whitespace-nowrap text-xs font-semibold">
              {b.runs}&nbsp;&nbsp;{b.balls}&nbsp;&nbsp;{b.fours}&nbsp;&nbsp;{b.sixes}
              &nbsp;&nbsp;{b.sr}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BowlersTable({ innings }: { innings: InningsView }) {
  if (innings.bowlers.length === 0) return null;
  return (
    <div className="border-t border-foreground">
      <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-foreground px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-foreground/50">
        <span>Bowler</span>
        <span className="score-nums">O&nbsp;&nbsp;M&nbsp;&nbsp;R&nbsp;&nbsp;W&nbsp;&nbsp;Econ</span>
      </div>
      <ul>
        {innings.bowlers.map((b) => (
          <li
            key={b.playerId}
            className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-b border-foreground/10 px-3 py-1.5 last:border-0"
          >
            <span className="flex items-baseline gap-1.5">
              <span className="truncate text-sm font-semibold">{b.name}</span>
              {innings.bowler?._id === b.playerId && (
                <span className="bg-[#E4002B] px-1 text-[8px] font-extrabold uppercase tracking-wider text-white">
                  ON
                </span>
              )}
            </span>
            <span className="score-nums whitespace-nowrap text-xs font-semibold">
              {b.overs}&nbsp;&nbsp;{b.maidens}&nbsp;&nbsp;{b.runs}&nbsp;&nbsp;
              {b.wickets}&nbsp;&nbsp;{b.econ}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InningsPanel({
  innings,
  active,
}: {
  innings: InningsView;
  active?: boolean;
}) {
  const e = innings.extras;
  const extrasLine = `Extras ${e.total} (wd ${e.wide}, nb ${e.noball}, b ${e.bye}, lb ${e.legbye})`;

  return (
    <div
      className={cn(
        "border border-foreground bg-white",
        active && "border-[#E4002B] shadow-[4px_4px_0_0_rgba(228,0,43,0.15)]",
      )}
    >
      {/* header */}
      <div
        className={cn(
          "flex items-center gap-3 border-b border-foreground px-3 py-2.5",
          active ? "bg-[#E4002B] text-white" : "bg-foreground text-white",
        )}
      >
        <TeamMark shortCode={innings.battingTeam.shortCode} color={innings.battingTeam.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold uppercase tracking-widest opacity-80">
            {innings.number === 1 ? "1st innings" : "2nd innings"} · {innings.battingTeam.name}
          </p>
          <p className="score-nums text-2xl font-extrabold leading-none">
            {innings.totalRuns}/{innings.wickets}
            <span className="ml-2 text-sm font-bold opacity-80">
              ({innings.oversLabel} ov)
            </span>
          </p>
        </div>
        <div className="text-right">
          {innings.target != null && (
            <p className="score-nums text-[10px] font-bold uppercase tracking-wider opacity-90">
              Target {innings.target}
            </p>
          )}
          <p className="score-nums text-[10px] font-bold uppercase tracking-wider opacity-90">
            CRR {innings.crr}
          </p>
          {innings.rrr != null && innings.number === 2 && (
            <p className="score-nums text-[10px] font-bold uppercase tracking-wider opacity-90">
              RRR {innings.rrr}
            </p>
          )}
        </div>
      </div>

      <BallsRow innings={innings} />

      <div className="border-b border-foreground/10 px-3 py-1.5 text-[10px] font-medium text-foreground/60">
        {extrasLine}
      </div>

      <BattersTable innings={innings} />
      <BowlersTable innings={innings} />
    </div>
  );
}
