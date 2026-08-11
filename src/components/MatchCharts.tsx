import type { InningsView } from "@/lib/format";
import { cn } from "@/lib/utils";

// ---- Manhattan (over-by-over run chart) -------------------------------------

const PHASE_COLORS = {
  powerplay: "#22d3ee",
  middle: "#facc15",
  death: "#ef4444",
};

export function ManhattanChart({
  innings,
  className,
}: {
  innings: InningsView;
  className?: string;
}) {
  const overs = innings.overs;
  const totalOvers = innings.isSuperOver ? 1 : Math.max(1, Math.round(innings.ballsBowled / 6) || 1);
  const ppEnd = Math.floor(totalOvers * 0.3) || 1;
  const deathStart = Math.ceil(totalOvers * 0.8);
  const maxRuns = Math.max(6, ...overs.map((o) => o.runs));
  const W = 560;
  const H = 200;
  const pad = 24;
  const plotW = W - pad * 2;
  const plotH = H - pad * 2 - 14;
  const step = overs.length > 0 ? plotW / overs.length : plotW;

  const phaseOf = (over: number) =>
    over <= ppEnd ? "powerplay" : over > deathStart ? "death" : "middle";

  return (
    <div className={cn("overflow-x-auto", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="min-w-[520px]"
        role="img"
        aria-label="Runs per over chart"
      >
        {/* gridlines */}
        {[0, 1, 2, 3, 4].map((i) => {
          const y = pad + (plotH / 4) * i;
          return (
            <g key={i}>
              <line x1={pad} y1={y} x2={W - pad} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
              <text x={pad - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#64748b">
                {Math.round(maxRuns * (1 - i / 4))}
              </text>
            </g>
          );
        })}
        {/* bars */}
        {overs.map((o, i) => {
          const h = (o.runs / maxRuns) * plotH;
          const x = pad + i * step + step * 0.18;
          const w = step * 0.64;
          const y = pad + plotH - h;
          const color = PHASE_COLORS[phaseOf(o.over)];
          return (
            <g key={o.over}>
              <rect
                x={x}
                y={y}
                width={w}
                height={Math.max(2, h)}
                fill={color}
                opacity={0.9}
              >
                <title>{`Over ${o.over} — ${o.runs} runs · ${o.wickets} wicket${o.wickets === 1 ? "" : "s"}`}</title>
              </rect>
              {o.wickets > 0 && (
                <text
                  x={x + w / 2}
                  y={Math.max(pad + 8, y - 4)}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={900}
                  fill="#ef4444"
                >
                  W
                </text>
              )}
              <text
                x={x + w / 2}
                y={pad + plotH + 12}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
              >
                {o.over}
              </text>
            </g>
          );
        })}
        {/* phase legend */}
        <g>
          {(Object.keys(PHASE_COLORS) as (keyof typeof PHASE_COLORS)[]).map((p, i) => (
            <g key={p} transform={`translate(${W - 150 + i * 52}, ${H - 8})`}>
              <rect x={0} y={-7} width={8} height={8} fill={PHASE_COLORS[p]} />
              <text x={11} y={0} fontSize={8} fill="#64748b">
                {p}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

// ---- Wagon wheel ------------------------------------------------------------

/** Region → compass angle (degrees, 0 = straight down the ground). */
const REGION_ANGLE: Record<string, number> = {
  "third-man": 30,
  point: 55,
  cover: 85,
  "extra-cover": 105,
  "mid-off": 130,
  "long-off": 155,
  straight: 180,
  "long-on": 205,
  "mid-on": 230,
  midwicket: 260,
  "deep-midwicket": 285,
  "square-leg": 305,
  "fine-leg": 330,
};

const RUN_COLOR: Record<number, string> = {
  1: "#94a3b8",
  2: "#22d3ee",
  3: "#a78bfa",
  4: "#facc15",
  6: "#ef4444",
};

const RUN_RADIUS: Record<number, number> = {
  1: 0.38,
  2: 0.44,
  3: 0.5,
  4: 0.62,
  6: 0.72,
};

export function WagonWheel({
  innings,
  className,
}: {
  innings: InningsView;
  className?: string;
}) {
  const shots = innings.wagonWheel;
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const groundR = size / 2 - 10;

  const byRegion = new Map<string, { runs: number; count: number }>();
  for (const s of shots) {
    const e = byRegion.get(s.region) ?? { runs: 0, count: 0 };
    e.runs += s.runs;
    e.count += 1;
    byRegion.set(s.region, e);
  }

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[380px]" role="img" aria-label="Wagon wheel">
        {/* ground */}
        <circle cx={cx} cy={cy} r={groundR} fill="#0b1524" stroke="#1e293b" />
        <circle cx={cx} cy={cy} r={groundR * 0.55} fill="none" stroke="#1e293b" strokeDasharray="4 4" />
        <circle cx={cx} cy={cy} r={groundR * 0.8} fill="none" stroke="#1e293b" strokeDasharray="2 4" />
        {/* pitch */}
        <rect
          x={cx - 7}
          y={cy - groundR * 0.42}
          width={14}
          height={groundR * 0.84}
          fill="#3f2f1a"
          stroke="#57432a"
        />
        {/* region labels */}
        {[...byRegion.entries()].map(([region, e]) => {
          const deg = (REGION_ANGLE[region] ?? 180) * (Math.PI / 180);
          const lx = cx + Math.sin(deg) * groundR * 0.9;
          const ly = cy - Math.cos(deg) * groundR * 0.9;
          return (
            <text
              key={region}
              x={lx}
              y={ly}
              textAnchor="middle"
              fontSize={8}
              fill="#475569"
              className="uppercase"
            >
              {region} {e.runs}
            </text>
          );
        })}
        {/* shot dots */}
        {shots.map((s, i) => {
          const deg = (REGION_ANGLE[s.region] ?? 180) * (Math.PI / 180);
          const r = (RUN_RADIUS[s.runs] ?? 0.5) * groundR;
          // tiny deterministic jitter so identical placements separate visually
          const jitter = ((i * 37) % 10) - 5;
          const x = cx + Math.sin(deg) * r + Math.sin(i * 12.9898) * jitter;
          const y = cy - Math.cos(deg) * r + Math.cos(i * 78.233) * jitter;
          const color = RUN_COLOR[s.runs] ?? "#94a3b8";
          return (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r={s.runs >= 4 ? 5.5 : 4}
                fill={color}
                stroke="#0f172a"
                strokeWidth={1.5}
              >
                <title>{`${s.overLabel} — ${s.runs} run${s.runs > 1 ? "s" : ""} · ${s.region}${s.shotType ? ` · ${s.shotType}` : ""}`}</title>
              </circle>
              {s.runs >= 4 && (
                <text
                  x={x}
                  y={y + 2.5}
                  textAnchor="middle"
                  fontSize={7}
                  fontWeight={900}
                  fill="#0f172a"
                >
                  {s.runs}
                </text>
              )}
            </g>
          );
        })}
        {shots.length === 0 && (
          <text x={cx} y={cy} textAnchor="middle" fontSize={10} fill="#475569">
            No shot placements recorded yet
          </text>
        )}
      </svg>

      {/* legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {[1, 2, 3, 4, 6].map((r) => (
          <span key={r} className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">
            <span className="size-2 rounded-full" style={{ background: RUN_COLOR[r] }} />
            {r} run{r > 1 ? "s" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
