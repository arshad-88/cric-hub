import { PlayerLink } from "@/components/PlayerLink";
import { BallChip, MicroLabel, TeamMark } from "@/components/swiss";
import type { InningsView } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "1st innings" / "2nd innings" / "Super Over 1" / "Super Over 2". */
export function inningsLabel(number: number): string {
  if (number === 1) return "1st innings";
  if (number === 2) return "2nd innings";
  return number === 3 ? "Super Over 1" : "Super Over 2";
}

function BallsRow({ innings }: { innings: InningsView }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2.5">
      <MicroLabel className="mr-1 text-[9px]">LAST 8</MicroLabel>
      {innings.recentBalls.length === 0 ? (
        <span className="text-[11px] font-medium text-slate-500">
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

function CurrentPartnership({ innings }: { innings: InningsView }) {
  const cur = innings.partnerships.current;
  if (!cur) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-border/60 bg-[#22c55e]/[0.04] px-3 py-1.5 text-[10px]">
      <MicroLabel className="text-[#22c55e]">Current partnership</MicroLabel>
      <span className="score-nums font-bold text-slate-100">
        {cur.runs} ({cur.balls})
      </span>
      <span className="truncate font-medium text-slate-400">
        {cur.batters.filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}

function FallOfWickets({ innings }: { innings: InningsView }) {
  const fow = innings.fow;
  if (fow.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-border/60 px-3 py-1.5 text-[10px]">
      <MicroLabel className="text-slate-500">FOW</MicroLabel>
      {fow.map((f) => (
        <span key={f.wickets} className="font-medium text-slate-400" title={f.batterName}>
          {f.score}/{f.wickets}
          <span className="text-slate-600"> ({f.overLabel})</span>
        </span>
      ))}
    </div>
  );
}

function BattersTable({ innings }: { innings: InningsView }) {
  if (innings.batters.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-[11px] font-medium uppercase tracking-widest text-slate-500">
        Batter yet to open
      </div>
    );
  }
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-border px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
        <span>Batter</span>
        <span className="score-nums">R&nbsp;&nbsp;B&nbsp;&nbsp;4s&nbsp;&nbsp;6s&nbsp;&nbsp;SR</span>
      </div>
      <ul>
        {innings.batters.map((b) => (
          <li
            key={b.playerId}
            className={cn(
              "grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-b border-border/60 px-3 py-1.5",
              b.isStriker && "bg-[#22c55e]/[0.06]",
            )}
          >
            <div className="min-w-0">
              <span className="flex items-baseline gap-1.5">
                <PlayerLink
                  id={b.playerId}
                  name={b.name}
                  className={cn(
                    "text-sm font-bold text-slate-100 transition-opacity",
                    b.status === "out" && "text-slate-400/70 opacity-60",
                  )}
                >
                  {b.name}
                  {b.status === "notOut" && <span className="ml-0.5 text-slate-500">*</span>}
                </PlayerLink>
                {b.isStriker && (
                  <span className="shrink-0 bg-[#22c55e] px-1 text-[8px] font-extrabold uppercase tracking-wider text-[#052e16]">
                    ●
                  </span>
                )}
                {b.isNonStriker && (
                  <span className="shrink-0 bg-[#22d3ee] px-1 text-[8px] font-extrabold uppercase tracking-wider text-[#083344]">
                    ▲
                  </span>
                )}
              </span>
              {b.status === "out" && b.dismissalText && (
                <span className="block truncate text-[10px] italic text-slate-500">
                  {b.dismissalText}
                </span>
              )}
            </div>
            <span className="score-nums whitespace-nowrap text-xs font-semibold text-slate-200">
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
    <div className="border-t border-border">
      <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-border px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
        <span>Bowler</span>
        <span className="score-nums">O&nbsp;&nbsp;M&nbsp;&nbsp;R&nbsp;&nbsp;W&nbsp;&nbsp;Econ&nbsp;&nbsp;Dots&nbsp;&nbsp;Wd&nbsp;&nbsp;Nb</span>
      </div>
      <ul>
        {innings.bowlers.map((b) => (
          <li
            key={b.playerId}
            className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-b border-border/60 px-3 py-1.5 last:border-0"
          >
            <span className="flex items-baseline gap-1.5">
              <PlayerLink id={b.playerId} name={b.name} className="text-sm font-semibold text-slate-100">
                {b.name}
              </PlayerLink>
              {innings.bowler?._id === b.playerId && (
                <span className="bg-[#ef4444] px-1 text-[8px] font-extrabold uppercase tracking-wider text-white glow-red">
                  ON
                </span>
              )}
            </span>
            <span className="score-nums whitespace-nowrap text-xs font-semibold text-slate-200">
              {b.overs}&nbsp;&nbsp;{b.maidens}&nbsp;&nbsp;{b.runs}&nbsp;&nbsp;
              {b.wickets}&nbsp;&nbsp;{b.econ}&nbsp;&nbsp;
              <span className="text-slate-400">{b.dots}</span>&nbsp;&nbsp;
              <span className="text-slate-500">{b.wides}</span>&nbsp;&nbsp;
              <span className="text-slate-500">{b.noballs}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PartnershipsBlock({ innings }: { innings: InningsView }) {
  const { list, highest } = innings.partnerships;
  if (list.length === 0 && !highest) return null;
  return (
    <div className="border-t border-border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MicroLabel className="text-slate-500">Partnerships</MicroLabel>
        {highest && (
          <span className="text-[10px] font-medium text-slate-500">
            Highest: <span className="score-nums font-bold text-[#facc15]">{highest.runs}</span>{" "}
            ({highest.batters.filter(Boolean).join(" · ")})
          </span>
        )}
      </div>
      <ul className="mt-1 space-y-0.5">
        {list.map((p, i) => (
          <li key={i} className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="truncate text-slate-300">
              {p.batters.filter(Boolean).join(" · ") || "—"}
            </span>
            <span className="score-nums shrink-0 text-xs font-bold text-slate-100">
              {p.runs} <span className="text-[9px] font-medium text-slate-500">({p.balls})</span>
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
  const chasing = innings.number === 2 || innings.number === 4;

  return (
    <div
      className={cn(
        "border border-border bg-card panel-glow",
        active && "border-[#22c55e]/70 glow-green",
      )}
    >
      {/* header */}
      <div
        className={cn(
          "flex items-center gap-3 border-b border-border px-3 py-2.5",
          active
            ? "bg-gradient-to-r from-[#052e16] to-[#0f3d1f]"
            : "bg-[#0b1524]",
        )}
      >
        <TeamMark shortCode={innings.battingTeam.shortCode} color={innings.battingTeam.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {inningsLabel(innings.number)} · {innings.battingTeam.name}
          </p>
          <p className="score-nums text-2xl font-extrabold leading-none text-white">
            {innings.totalRuns}/{innings.wickets}
            <span className="ml-2 text-sm font-bold text-slate-400">
              ({innings.oversLabel} ov)
            </span>
          </p>
        </div>
        <div className="text-right">
          {innings.target != null && (
            <p className="score-nums text-[10px] font-bold uppercase tracking-wider text-[#facc15] led-gold">
              Target {innings.target}
            </p>
          )}
          {chasing && innings.needed != null && innings.ballsLeft != null && (
            <p className="score-nums text-[10px] font-bold uppercase tracking-wider text-[#22c55e]">
              Need {innings.needed} off {innings.ballsLeft}
            </p>
          )}
          <p className="score-nums text-[10px] font-bold uppercase tracking-wider text-slate-400">
            CRR {innings.crr}
          </p>
          {innings.rrr != null && chasing && (
            <p className="score-nums text-[10px] font-bold uppercase tracking-wider text-[#22d3ee] led-cyan">
              RRR {innings.rrr}
            </p>
          )}
          {innings.dlsPar != null && chasing && (
            <p className="score-nums text-[10px] font-bold uppercase tracking-wider text-[#a78bfa] led-cyan">
              DLS Par {innings.dlsPar}
            </p>
          )}
        </div>
      </div>

      <BallsRow innings={innings} />
      <CurrentPartnership innings={innings} />
      <FallOfWickets innings={innings} />

      <div className="border-b border-border/60 px-3 py-1.5 text-[10px] font-medium text-slate-500">
        {extrasLine}
      </div>

      <BattersTable innings={innings} />
      <BowlersTable innings={innings} />
      <PartnershipsBlock innings={innings} />
    </div>
  );
}
