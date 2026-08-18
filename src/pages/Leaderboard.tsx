import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { PointsTable } from "@/components/PointsTable";
import { RequireAuth } from "@/components/RequireAuth";
import { PlayerLink } from "@/components/PlayerLink";
import { MicroLabel, SectionHeading, TeamMark } from "@/components/swiss";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

type Category =
  | "runs"
  | "wickets"
  | "sixes"
  | "fours"
  | "economy"
  | "average"
  | "catches"
  | "mvp";

type Mode = "tournament" | "career";

/** Public leaderboards never reveal full phone numbers — only the last 4 digits. */
function maskPhone(key: string): string {
  if (!key) return "";
  const digits = key.replace(/\D/g, "");
  if (digits.length < 6) return key;
  return `••••• ${digits.slice(-4)}`;
}

export default function Leaderboard() {
  const tournaments = useQuery(api.tournaments.list);
  const active = useQuery(api.tournaments.getActive);
  const [tournamentId, setTournamentId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("tournament");

  const resolvedId =
    tournamentId || active?._id || tournaments?.[0]?.id || "";
  const data = useQuery(
    api.leaderboard.get,
    mode === "tournament" && resolvedId
      ? { tournamentId: resolvedId as Id<"tournaments"> }
      : "skip",
  );
  const career = useQuery(
    api.leaderboard.career,
    mode === "career" ? {} : "skip",
  );
  const mvp = useQuery(
    api.mvp.getTournament,
    mode === "tournament" && resolvedId
      ? { tournamentId: resolvedId as Id<"tournaments"> }
      : "skip",
  );
  const hub = useQuery(
    api.admin.hubStats,
    resolvedId ? { tournamentId: resolvedId as Id<"tournaments"> } : "skip",
  );
  const [category, setCategory] = useState<Category>("runs");
  const selected =
    tournaments?.find((t) => t.id === resolvedId) ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index="01"
            title={
              mode === "career"
                ? "Career — all leagues"
                : selected
                  ? `${selected.name} — Stats`
                  : "Points & Stats"
            }
            className="flex-1"
          />
          <div className="flex items-center gap-2">
            <div className="flex border border-border">
              {(["tournament", "career"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-colors",
                    mode === m
                      ? "bg-[#22c55e] text-[#052e16]"
                      : "bg-card text-slate-400 hover:text-white",
                  )}
                >
                  {m === "tournament" ? "Tournament" : "Career · all leagues"}
                </button>
              ))}
            </div>
            {mode === "tournament" && (
              <div className="w-56">
                <Select value={resolvedId || undefined} onValueChange={setTournamentId}>
                  <SelectTrigger className="rounded-none border-border bg-card text-xs uppercase tracking-wider text-slate-200">
                    <SelectValue placeholder="Tournament" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border bg-card">
                    {(tournaments ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} {t.year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {mode === "career" ? (
          <CareerBoard career={career} />
        ) : (
          <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <MicroLabel className="mb-3 block text-[#facc15]">
                Points table — P W L T · NRR · Pts
              </MicroLabel>
              {data === undefined ? (
                <div className="h-40 animate-pulse border border-border bg-card" />
              ) : (
                <PointsTable rows={data?.pointsTable ?? []} isOrganizer={hub?.isOrganizer === true} tournamentId={resolvedId} />
              )}
              <p className="mt-2 text-[10px] uppercase tracking-widest text-slate-600">
                Win = 2 pts · Tie = 1 pt · NRR uses full allocation for all-out innings
              </p>
            </div>

            <div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {([
                  ["runs", "Runs"],
                  ["wickets", "Wickets"],
                  ["sixes", "Sixes"],
                  ["fours", "Fours"],
                  ["economy", "Economy"],
                  ["average", "Average"],
                  ["catches", "Catches"],
                  ["mvp", "MVP"],
                ] as [Category, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    className={cn(
                      "border px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest transition-colors",
                      category === key
                        ? "border-[#22c55e] bg-[#22c55e]/15 text-[#22c55e]"
                        : "border-border bg-card text-slate-500 hover:text-white",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <CategoryBoard category={category} data={data} mvp={mvp} />
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function CategoryBoard({
  category,
  data,
  mvp,
}: {
  category: Category;
  data: ReturnType<typeof Object> | undefined;
  mvp:
    | {
        tournament: { id: Id<"tournaments">; name: string; year: number };
        config: {
          runPoint: number;
          srTarget: number;
          srBonusPerPoint: number;
          boundaryBonus: number;
          wicketPoint: number;
          econTarget: number;
          econBonusPerPoint: number;
          maidenBonus: number;
          catchPoint: number;
          runOutPoint: number;
          stumpingPoint: number;
          winningBonus: number;
        };
        rows: {
          playerId: string;
          name: string;
          teamShortCode: string | null;
          teamColor: string | null;
          teamName: string | null;
          runs: number;
          wickets: number;
          sr: number;
          econ: number;
          catches: number;
          score: number;
          matches: number;
        }[];
      }
    | null
    | undefined;
}) {
  const rows = categoryRows(category, data as never, mvp as never);
  const header = headerFor(category);
  const tone = toneFor(category);
  return (
    <div className="border border-border bg-card panel-glow">
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border px-3 py-2",
          tone.bg,
        )}
      >
        <Trophy className={cn("size-4", tone.text)} />
        <MicroLabel className={tone.text}>{titleFor(category)}</MicroLabel>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-border px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
        <span>Player · Team</span>
        <span className="score-nums">{header}</span>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="score-nums w-4 text-[10px] font-extrabold text-slate-500">{i + 1}</span>
              <span className="min-w-0">
                <PlayerLink id={r.playerId} name={r.name} className="block truncate text-sm font-bold text-slate-100">
                  {r.name}
                </PlayerLink>
                <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  {r.teamShortCode ? (
                    <span className="flex items-center gap-1">
                      <TeamMark shortCode={r.teamShortCode} color={r.teamColor ?? "#22c55e"} size="sm" />
                      {r.teamName ?? ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </span>
              </span>
            </span>
            <span className="score-nums whitespace-nowrap text-xs font-semibold text-slate-200">
              {r.value}
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-3 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
            No entries yet
          </li>
        )}
      </ul>
    </div>
  );
}

function titleFor(category: Category): string {
  switch (category) {
    case "runs":
      return "Most runs";
    case "wickets":
      return "Most wickets";
    case "sixes":
      return "Most sixes";
    case "fours":
      return "Most fours";
    case "economy":
      return "Best economy";
    case "average":
      return "Best average";
    case "catches":
      return "Most catches";
    case "mvp":
      return "Most valuable player";
  }
}

function headerFor(category: Category): string {
  switch (category) {
    case "runs":
      return "R B 4s 6s SR Inns";
    case "wickets":
      return "W R O M Econ";
    case "sixes":
      return "6s R SR";
    case "fours":
      return "4s R";
    case "economy":
      return "Econ O W";
    case "average":
      return "Avg R SR";
    case "catches":
      return "C RO St";
    case "mvp":
      return "M W R MVP";
  }
}

function toneFor(category: Category): { bg: string; text: string } {
  if (category === "wickets" || category === "economy")
    return { bg: "bg-[#083344]", text: "text-[#22d3ee]" };
  if (category === "mvp") return { bg: "bg-[#3b0764]", text: "text-[#c084fc]" };
  if (category === "catches") return { bg: "bg-[#052e16]", text: "text-[#22c55e]" };
  return { bg: "bg-[#422006]", text: "text-[#facc15]" };
}

function categoryRows(
  category: Category,
  data: any,
  mvp: any,
): { key: string; playerId: string; name: string; teamShortCode?: string; teamColor?: string; teamName?: string; value: string }[] {
  const fmt = (team: { shortCode?: string; color?: string; name?: string } | null) => ({
    teamShortCode: team?.shortCode ?? undefined,
    teamColor: team?.color ?? undefined,
    teamName: team?.name ?? undefined,
  });
  switch (category) {
    case "runs":
      return (data?.topBatters ?? []).map((b: any) => ({
        key: b.playerId,
        playerId: b.playerId,
        name: b.name,
        ...fmt(b.team),
        value: `${b.runs}  ${b.balls}  ${b.fours}  ${b.sixes}  ${b.sr}  ${b.innings}`,
      }));
    case "wickets":
      return (data?.topBowlers ?? []).map((b: any) => ({
        key: b.playerId,
        playerId: b.playerId,
        name: b.name,
        ...fmt(b.team),
        value: `${b.wickets}  ${b.runs}  ${b.overs}  ${b.maidens}  ${b.econ}`,
      }));
    case "sixes":
      return (data?.mostSixes ?? []).map((b: any) => ({
        key: b.playerId,
        playerId: b.playerId,
        name: b.name,
        ...fmt(b.team),
        value: `${b.sixes}  ${b.runs}  ${b.sr}`,
      }));
    case "fours":
      return (data?.mostFours ?? []).map((b: any) => ({
        key: b.playerId,
        playerId: b.playerId,
        name: b.name,
        ...fmt(b.team),
        value: `${b.fours}  ${b.runs}`,
      }));
    case "economy":
      return (data?.bestEconomy ?? []).map((b: any) => ({
        key: b.playerId,
        playerId: b.playerId,
        name: b.name,
        ...fmt(b.team),
        value: `${b.econ}  ${b.overs}  ${b.wickets}`,
      }));
    case "average":
      return (data?.bestAverage ?? []).map((b: any) => ({
        key: b.playerId,
        playerId: b.playerId,
        name: b.name,
        ...fmt(b.team),
        value: `${b.avg}  ${b.runs}  ${b.sr}`,
      }));
    case "catches":
      return (data?.mostCatches ?? []).map((b: any) => ({
        key: b.playerId,
        playerId: b.playerId,
        name: b.name,
        ...fmt(b.team),
        value: `${b.catches}  ${b.runOuts}  ${b.stumpings}`,
      }));
    case "mvp":
      return (mvp?.rows ?? []).map((b: any) => ({
        key: b.playerId,
        playerId: b.playerId,
        name: b.name,
        teamShortCode: b.teamShortCode ?? undefined,
        teamColor: b.teamColor ?? undefined,
        teamName: b.teamName ?? undefined,
        value: `${b.matches}  ${b.wickets}  ${b.runs}  ${b.score}`,
      }));
  }
}

function CareerBoard({
  career,
}: {
  career: {
    topBatters: {
      key: string;
      name: string;
      leagues: number;
      runs: number;
      balls: number;
      fours: number;
      sixes: number;
      sr: number;
      innings: number;
      matches: number;
    }[];
    topBowlers: {
      key: string;
      name: string;
      leagues: number;
      wickets: number;
      runs: number;
      balls: number;
      overs: string;
      maidens: number;
      econ: number;
      matches: number;
    }[];
  } | undefined;
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div>
        <MicroLabel className="mb-3 flex items-center gap-1.5 text-[#facc15]">
          <Trophy className="size-3.5" /> Orange cap — career runs across all leagues
        </MicroLabel>
        <div className="border border-border bg-card panel-glow">
          <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-border bg-[#422006] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-[#facc15]">
            <span>Player · phone</span>
            <span className="score-nums">R&nbsp;B&nbsp;4s&nbsp;6s&nbsp;SR&nbsp;Inns&nbsp;Lg</span>
          </div>
          <ul className="divide-y divide-border/60">
            {(career?.topBatters ?? []).map((b, i) => (
              <li key={b.key} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="score-nums w-4 text-[10px] font-extrabold text-slate-500">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-100">{b.name}</span>
                    <span className="score-nums block truncate text-[10px] font-bold text-slate-500">
                      {maskPhone(b.key) || "—"}
                    </span>
                  </span>
                </span>
                <span className="score-nums whitespace-nowrap text-xs font-semibold text-slate-200">
                  {b.runs}&nbsp;&nbsp;{b.balls}&nbsp;&nbsp;{b.fours}&nbsp;&nbsp;{b.sixes}
                  &nbsp;&nbsp;{b.sr}&nbsp;&nbsp;{b.innings}&nbsp;&nbsp;
                  <span className="text-[#22c55e]">{b.leagues}</span>
                </span>
              </li>
            ))}
            {(career?.topBatters ?? []).length === 0 && (
              <li className="px-3 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                No career runs yet
              </li>
            )}
          </ul>
        </div>
        <p className="mt-2 text-[10px] uppercase tracking-widest text-slate-600">
          One phone number = one player. Stats merge across every league they've played.
        </p>
      </div>

      <div>
        <MicroLabel className="mb-3 flex items-center gap-1.5 text-[#22d3ee]">
          <Trophy className="size-3.5" /> Purple cap — career wickets across all leagues
        </MicroLabel>
        <div className="border border-border bg-card panel-glow">
          <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-border bg-[#083344] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-[#22d3ee]">
            <span>Player · phone</span>
            <span className="score-nums">W&nbsp;R&nbsp;O&nbsp;Econ&nbsp;Lg</span>
          </div>
          <ul className="divide-y divide-border/60">
            {(career?.topBowlers ?? []).map((b, i) => (
              <li key={b.key} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="score-nums w-4 text-[10px] font-extrabold text-slate-500">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-100">{b.name}</span>
                    <span className="score-nums block truncate text-[10px] font-bold text-slate-500">
                      {maskPhone(b.key) || "—"}
                    </span>
                  </span>
                </span>
                <span className="score-nums whitespace-nowrap text-xs font-semibold text-slate-200">
                  {b.wickets}&nbsp;&nbsp;{b.runs}&nbsp;&nbsp;{b.overs}&nbsp;&nbsp;
                  {b.econ}&nbsp;&nbsp;
                  <span className="text-[#22c55e]">{b.leagues}</span>
                </span>
              </li>
            ))}
            {(career?.topBowlers ?? []).length === 0 && (
              <li className="px-3 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                No career wickets yet
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
