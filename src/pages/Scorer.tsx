import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BallChip, MicroLabel } from "@/components/swiss";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatOvers } from "@/lib/format";
import { useScorePopups } from "@/hooks/use-score-popups";
import { ScorePopupStage } from "@/components/ScorePopupStage";
import TossFlow from "@/components/TossFlow";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  Clapperboard,
  KeyRound,
  RotateCcw,
  Trophy,
  Users,
  Video,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

type ExtraType = "wide" | "noball" | "bye" | "legbye";
type WicketType = "Bowled" | "Caught" | "Run out" | "Stumped" | "LBW";

interface PlayerDoc {
  _id: Id<"players">;
  teamId: Id<"teams">;
  name: string;
  role: "Batsman" | "Bowler" | "All-rounder" | "Wicketkeeper";
  battingStyle?: string;
  bowlingStyle?: string;
  jerseyNumber?: number;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
}

const WICKET_TYPES: WicketType[] = [
  "Bowled", "Caught", "Run out", "Stumped", "LBW",
  "Hit wicket", "Obstructing the field", "Timed out",
  "Retired hurt", "Retired out",
];

/** Shot options asked after every scoring ball (feeds the wagon wheel). */
const SHOT_TYPES = [
  "Drive",
  "Cut",
  "Pull",
  "Hook",
  "Sweep",
  "Reverse sweep",
  "Flick",
  "Lofted",
  "Slog",
  "Steer",
  "Defensive",
] as const;

/** Regions must match REGION_ANGLE keys in MatchCharts.tsx (wagon wheel). */
const SHOT_REGIONS = [
  "straight",
  "cover",
  "extra-cover",
  "point",
  "third-man",
  "mid-off",
  "long-off",
  "mid-on",
  "long-on",
  "midwicket",
  "deep-midwicket",
  "square-leg",
  "fine-leg",
] as const;

export default function Scorer() {
  const { matchId } = useParams<{ matchId: string }>();
  const scorecard = useQuery(api.scorecard.get, matchId ? { matchId: matchId as Id<"matches"> } : "skip");

  const current = scorecard?.currentInnings ?? null;
  const battingTeamId = current?.battingTeam._id as Id<"teams"> | undefined;
  const bowlingTeamId = current?.bowlingTeam._id as Id<"teams"> | undefined;
  const battingSquad = useQuery(
    api.players.listByTeam,
    battingTeamId ? { teamId: battingTeamId } : "skip",
  );
  const bowlingSquad = useQuery(
    api.players.listByTeam,
    bowlingTeamId ? { teamId: bowlingTeamId } : "skip",
  );

  const record = useMutation(api.scoring.recordDelivery);
  const undo = useMutation(api.scoring.undoLastDelivery);
  const setBowlerM = useMutation(api.scoring.setBowler);
  const setBatsmen = useMutation(api.scoring.setBatsmen);
  const updateStream = useMutation(api.matches.updateStreamUrl);
  const undoToss = useMutation(api.matches.undoToss);
  const endInningsEarlyM = useMutation(api.scoring.endInningsEarly);
  const concedeMatch = useMutation(api.scoring.endMatchConceded);
  const returnRetiredHurt = useMutation(api.scoring.returnRetiredHurtBatter);
  const setDLSTargetM = useMutation(api.scoring.setDLSTarget);
  const hub = useQuery(
    api.admin.hubStats,
    scorecard?.tournament.id
      ? { tournamentId: scorecard.tournament.id as Id<"tournaments"> }
      : "skip",
  );

  const [busy, setBusy] = useState(false);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState<ExtraType | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [bowlerOpen, setBowlerOpen] = useState(false);
  const [streamOpen, setStreamOpen] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const [shotPending, setShotPending] = useState<number | null>(null);
  const [xiEdit, setXiEdit] = useState(false);
  const [endInningsOpen, setEndInningsOpen] = useState(false);
  const [concedeOpen, setConcedeOpen] = useState(false);
  const [returnBatterOpen, setReturnBatterOpen] = useState(false);
  const [dlsTargetOpen, setDlsTargetOpen] = useState(false);
  const events = useQuery(
    api.notifications.listForMatch,
    matchId ? { matchId: matchId as Id<"matches"> } : "skip",
  );
  const popups = useScorePopups(
    scorecard,
    battingSquad ?? [],
    bowlingSquad ?? [],
    events ?? [],
  );

  if (scorecard === undefined) {
    return <ScorerShell><div className="h-10 w-10 animate-spin border-2 border-[#22c55e] border-t-transparent" /></ScorerShell>;
  }
  if (scorecard === null) {
    return (
      <ScorerShell>
        <p className="border border-border bg-card px-4 py-10 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
          Match not found
        </p>
      </ScorerShell>
    );
  }

  const { match, teamA, teamB } = scorecard;

  // Playing XI selection: after the toss the scorer locks in 11 players per
  // team, and only those 11 can bat/bowl for the whole match. Matches without
  // a saved XI (already-live / legacy games) fall back to the full squad.
  const xiA = match.teamAXI ?? [];
  const xiB = match.teamBXI ?? [];
  const xiSaved = xiA.length === 11 && xiB.length === 11;
  const xiOfTeam = (teamId: Id<"teams"> | undefined) =>
    !teamId ? [] : teamId === teamA._id ? xiA : xiB;
  const restrictToXI = (teamId: Id<"teams"> | undefined, squad: PlayerDoc[] | undefined) => {
    const xi = xiOfTeam(teamId);
    if (xi.length === 0) return squad ?? [];
    const set = new Set(xi.map((id) => String(id)));
    return (squad ?? []).filter((p) => set.has(String(p._id)));
  };
  const battingSquadXI = restrictToXI(battingTeamId, battingSquad);
  const bowlingSquadXI = restrictToXI(bowlingTeamId, bowlingSquad);

  const handleUndoToss = async () => {
    setBusy(true);
    try {
      await undoToss({ matchId: match.id as Id<"matches"> });
      setXiEdit(false);
      toast.success("Toss undone — redo the ceremony.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not undo the toss.");
    } finally {
      setBusy(false);
    }
  };

  // The toss drives the start-of-match flow: once a toss is saved the scorer
  // skips the ceremony and lands straight on "start innings" with the batting
  // side pre-filled from the toss decision (bat → winner bats, bowl → the other).
  const tossSaved = Boolean(match.tossWinnerId && match.tossDecision);
  const tossWinnerTeam = tossSaved
    ? match.tossWinnerId === teamA._id
      ? teamA
      : teamB
    : null;
  const defaultBattingId =
    tossSaved && tossWinnerTeam
      ? match.tossDecision === "bat"
        ? tossWinnerTeam._id
        : tossWinnerTeam._id === teamA._id
          ? teamB._id
          : teamA._id
      : "";

  // Only the tournament's organizers may score; everyone else is blocked
  // (mutations are also enforced server-side).
  if (hub && hub.isOrganizer === false) {
    return (
      <ScorerShell>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="max-w-sm border border-border bg-card p-8 panel-glow">
            <KeyRound className="mx-auto size-8 text-[#facc15]" />
            <h1 className="mt-4 text-lg font-extrabold uppercase tracking-tight text-white">
              Organizers only
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Only the tournament's organizers can score this match. Ask the
              organizer to add your phone number to their tournament.
            </p>
            <Link
              to="/dashboard"
              className="mt-5 inline-flex items-center gap-1.5 bg-[#22c55e] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#052e16] transition-colors hover:bg-[#facc15] hover:text-[#422006]"
            >
              Back to My Hub <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </ScorerShell>
    );
  }

  const striker = current?.striker ?? null;
  const nonStriker = current?.nonStriker ?? null;
  const bowler = current?.bowler ?? null;

  const needsStart = !current;
  const needsOpeners = current != null && !current.striker && !current.isComplete;
  const newOver = current != null && !current.isComplete && current.ballsBowled > 0 && current.ballsBowled % 6 === 0;
  // A match is only over once a result is locked in — a tied match stays live
  // so the scorer can open the Super Over.
  const matchOver = !!match.result;
  const currentOver = current?.isComplete ?? false;
  const superOverReady =
    match.superOver &&
    !matchOver &&
    (current === null || (current.number === 2 && current.isComplete));
  const superOverSource = scorecard.innings.find((i) => i.number === 2) ?? current;
  const soBattingTeamId = (superOverSource?.battingTeam._id ?? "") as Id<"teams">;
  const soBowlingTeamId = (superOverSource?.bowlingTeam._id ?? "") as Id<"teams">;

  const strikerCard = current?.batters.find((b) => b.isStriker);
  const nonStrikerCard = current?.batters.find((b) => b.isNonStriker);
  const bowlerCard = current?.bowlers.find((b) => b.playerId === bowler?._id);
  // Players already dismissed this innings — they cannot bat again, so they
  // must never appear as the next-batter option when a wicket falls.
  const outPlayerIds = (current?.batters ?? [])
    .filter((b) => b.status === "out")
    .map((b) => b.playerId);

  /** Record a scoring ball — for runs > 0 we first ask which shot + where it
   *  went (that placement feeds the wagon wheel), then record with the tags. */
  const recordShot = async (runs: number, shotType?: string, shotRegion?: string) => {
    if (!current || !striker || !bowler) {
      toast.error("Set the openers and the bowler first.");
      return;
    }
    setBusy(true);
    try {
      await record({
        matchId: match.id as Id<"matches">,
        inningsId: current.id as Id<"innings">,
        bowlerId: bowler._id as Id<"players">,
        batsmanId: striker._id as Id<"players">,
        nonStrikerId: nonStriker?._id as Id<"players"> | undefined,
        runsScored: runs,
        extraType: "none",
        extraRuns: 0,
        isWicket: false,
        shotRegion: shotRegion,
        shotType: shotType,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the ball.");
    } finally {
      setBusy(false);
    }
  };

  const tap = (runs: number) => {
    if (!current || !striker || !bowler) {
      toast.error("Set the openers and the bowler first.");
      return;
    }
    if (runs > 0) {
      // ask which shot + which area of the ground (wagon wheel data)
      setShotPending(runs);
      return;
    }
    void recordShot(0);
  };

  const handleUndo = async () => {
    if (!scorecard) return;
    // Undo the innings that actually holds the last ball — this is usually the
    // current innings, but right after innings 1 auto-completes, innings 2 is
    // empty and the scorer needs to fix a ball in innings 1 instead.
    const lastWithBalls =
      [...scorecard.innings]
        .reverse()
        .find((i) => i.commentary.length > 0) ?? null;
    const undoInnings = lastWithBalls ?? current;
    if (!undoInnings) return;
    setBusy(true);
    try {
      const res = await undo({
        matchId: match.id as Id<"matches">,
        inningsId: undoInnings.id as Id<"innings">,
      });
      toast.success(res.reset ? "Innings reset." : "Last ball undone.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not undo.");
    } finally {
      setBusy(false);
      setUndoOpen(false);
    }
  };

  const handleSwap = async () => {
    if (!current || !striker || !nonStriker) return;
    try {
      await setBatsmen({
        inningsId: current.id as Id<"innings">,
        strikerId: nonStriker._id as Id<"players">,
        nonStrikerId: striker._id as Id<"players">,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not swap strike.");
    }
  };

  const handleSaveStream = async () => {
    setBusy(true);
    try {
      await updateStream({
        matchId: match.id as Id<"matches">,
        streamUrl: streamUrl.trim(),
      });
      toast.success("Stream link updated — viewers see it instantly.");
      setStreamOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the stream.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScorerShell>
      <ScorePopupStage popups={popups} />
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-panel px-4 py-3">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white">
          <ArrowLeft className="size-3.5" /> My Hub
        </Link>
        <span className="truncate text-xs font-extrabold uppercase tracking-tight text-white">
          {teamA.shortCode} v {teamB.shortCode}
          <span className="ml-2 inline-flex items-center gap-1 text-[#ef4444]">
            <span className="live-dot relative flex size-1.5">
              <span className="relative inline-flex size-1.5 rounded-full bg-[#ef4444]" />
            </span>
            Scorer
          </span>
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to={`/matches/${match.id}`} className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#22c55e] hover:text-white">
            Public <ArrowLeftRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {/* score strip */}
      <div className="border-b border-border bg-card px-4 py-3 panel-glow">
        {match.result ? (
          <p className="text-sm font-extrabold uppercase tracking-wide text-[#22c55e]">{match.result}</p>
        ) : current ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="score-nums text-xl font-extrabold text-white">
              {current.battingTeam.shortCode}{" "}
              {current.totalRuns}/{current.wickets}
              <span className="ml-1.5 text-xs font-bold text-slate-400">
                ({formatOvers(current.ballsBowled)} ov)
              </span>
            </p>
            <div className="flex items-center gap-3 score-nums text-[11px] font-bold text-slate-400">
              {current.target != null && <span className="text-[#facc15]">Target {current.target}</span>}
              <span>CRR {current.crr}</span>
              {current.rrr != null && <span className="text-[#22d3ee]">RRR {current.rrr}</span>}
            </div>
          </div>
        ) : (
          <p className="text-sm font-extrabold uppercase tracking-wide text-slate-400">Upcoming fixture</p>
        )}
      </div>

      {/* main */}
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        {matchOver && (
          <div className="mb-4 border-2 border-[#22c55e] bg-card p-4 text-center panel-glow">
            <MicroLabel className="text-[#22c55e]">Match complete</MicroLabel>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">
              Well scored, scorer.
            </p>
          </div>
        )}

        {superOverReady && (
          <SuperOverStartPanel
            matchId={match.id}
            battingTeamId={soBattingTeamId}
            bowlingTeamId={soBowlingTeamId}
          />
        )}

        {!superOverReady && needsStart &&
          (tossSaved ? (
            xiSaved && !xiEdit ? (
              <StartInningsPanel
                matchId={match.id}
                teamA={teamA}
                teamB={teamB}
                defaultBattingId={defaultBattingId}
                tossNote={`${tossWinnerTeam?.name ?? ""} won the toss and chose to ${match.tossDecision} first`}
                teamAXI={xiA}
                teamBXI={xiB}
                onEditXI={() => setXiEdit(true)}
                onUndoToss={handleUndoToss}
              />
            ) : (
              <PlayingXIPanel
                matchId={match.id}
                teamA={teamA}
                teamB={teamB}
                initialA={xiA}
                initialB={xiB}
                onUndoToss={handleUndoToss}
              />
            )
          ) : (
            <TossFlow matchId={match.id} teamA={teamA} teamB={teamB} />
          ))}

        {needsOpeners && (
          <>
            <OpenersPanel inningsId={current.id} battingSquad={battingSquadXI} bowlingSquad={bowlingSquadXI} />
            <button
              type="button"
              disabled={busy}
              onClick={() => setUndoOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 border border-border bg-card py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-300 transition-transform active:scale-95 hover:border-[#ef4444] hover:text-[#ef4444]"
            >
              <RotateCcw className="size-4" /> Undo last ball of previous innings
            </button>
          </>
        )}

        {!superOverReady && !needsStart && !needsOpeners && current && (
          <>
            {currentOver && (
              <p className="mb-3 border border-[#facc15]/50 bg-[#422006]/40 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#facc15]">
                {match.superOver && current.number >= 3
                  ? "Super Over over — final scores are in"
                  : "Innings over — set the new innings up to continue"}
              </p>
            )}
            {/* crease */}
            <div className="grid grid-cols-3 gap-px border border-border bg-border">
              <div className="bg-card px-3 py-3">
                <MicroLabel className="text-[#22c55e]">Striker</MicroLabel>
                <p className="mt-1 truncate text-sm font-extrabold text-white">{strikerCard?.name ?? striker?.name ?? "—"}</p>
                <p className="score-nums text-[11px] font-bold text-slate-400">
                  {strikerCard ? `${strikerCard.runs} (${strikerCard.balls}) · ${strikerCard.sr} SR` : "—"}
                </p>
              </div>
              <div className="bg-card px-3 py-3">
                <MicroLabel className="text-slate-500">Non-striker</MicroLabel>
                <p className="mt-1 truncate text-sm font-extrabold text-white">{nonStrikerCard?.name ?? nonStriker?.name ?? "—"}</p>
                <p className="score-nums text-[11px] font-bold text-slate-400">
                  {nonStrikerCard ? `${nonStrikerCard.runs} (${nonStrikerCard.balls})` : "—"}
                </p>
              </div>
              <div className="bg-card px-3 py-3">
                <MicroLabel className="text-[#22d3ee]">Bowler</MicroLabel>
                <p className="mt-1 truncate text-sm font-extrabold text-white">{bowler?.name ?? "—"}</p>
                <p className="score-nums text-[11px] font-bold text-slate-400">
                  {bowlerCard ? `${bowlerCard.overs}-${bowlerCard.maidens}-${bowlerCard.runs}-${bowlerCard.wickets}` : "—"}
                </p>
              </div>
            </div>

            {/* over + quick actions */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {newOver ? (
                <span className="inline-flex items-center gap-2 border-2 border-[#facc15] bg-[#422006] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#facc15] glow-gold">
                  New over — set bowler <Check className="size-3.5" />
                </span>
              ) : (
                <span className="score-nums border border-border bg-card px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Over {current.oversLabel} · {6 - (current.ballsBowled % 6 || 6)} balls left
                </span>
              )}
              <button
                type="button"
                onClick={() => setBowlerOpen(true)}
                className="border border-border bg-card px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:border-[#22d3ee] hover:text-[#22d3ee]"
              >
                Change bowler
              </button>
              <button
                type="button"
                onClick={handleSwap}
                disabled={!striker || !nonStriker}
                className="border border-border bg-card px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:border-[#22c55e] hover:text-[#22c55e] disabled:opacity-40"
              >
                Swap strike
              </button>
            </div>

            {/* how to score — keep it obvious, even mid-argument */}
            <div className="mt-4 border border-[#22d3ee]/30 bg-[#083344]/40 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-[#22d3ee]">
                How to score — tap the runs the batter ran · 4s &amp; 6s are green · W = Wicket · WD = Wide ball · NB = No ball · BYE / LB = runs without the bat
              </p>
              <p className="mt-0.5 text-[8px] font-bold uppercase tracking-widest text-slate-500">
                Made a mistake? Tap Undo — it removes the last ball, nothing is permanent
              </p>
            </div>

            {/* keypad */}
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[0, 1, 2, 3, 4, 6].map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={busy || currentOver}
                  onClick={() => tap(r)}
                  className={cn(
                    "score-nums py-5 text-2xl font-extrabold transition-transform active:scale-95",
                    r === 4 || r === 6
                      ? "bg-[#22c55e] text-[#052e16] glow-green hover:bg-[#4ade80]"
                      : "bg-panel text-white hover:bg-panel-2",
                  )}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                disabled={busy || currentOver}
                onClick={() => setWicketOpen(true)}
                className="flex flex-col items-center justify-center gap-1 bg-[#ef4444] py-4 text-2xl font-extrabold text-white transition-transform active:scale-95 glow-red hover:bg-[#dc2626] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>W</span>
                <span className="text-[8px] font-black uppercase tracking-widest">Wicket</span>
              </button>
              <button
                type="button"
                disabled={busy || currentOver}
                onClick={() => setExtraOpen("wide")}
                className="flex flex-col items-center justify-center gap-1 border-2 border-[#facc15] bg-[#422006] py-4 text-sm font-extrabold text-[#facc15] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>WD</span>
                <span className="text-[7px] font-black uppercase tracking-widest">Wide ball</span>
              </button>
              <button
                type="button"
                disabled={busy || currentOver}
                onClick={() => setExtraOpen("noball")}
                className="flex flex-col items-center justify-center gap-1 border-2 border-[#22d3ee] bg-[#083344] py-4 text-sm font-extrabold text-[#22d3ee] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>NB</span>
                <span className="text-[7px] font-black uppercase tracking-widest">No ball</span>
              </button>
              <button
                type="button"
                disabled={busy || currentOver}
                onClick={() => setExtraOpen("bye")}
                className="flex flex-col items-center justify-center gap-1 border border-border bg-card py-4 text-sm font-extrabold text-slate-300 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>BYE</span>
                <span className="text-[7px] font-black uppercase tracking-widest">Byes</span>
              </button>
              <button
                type="button"
                disabled={busy || currentOver}
                onClick={() => setExtraOpen("legbye")}
                className="flex flex-col items-center justify-center gap-1 border border-border bg-card py-4 text-sm font-extrabold text-slate-300 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>LB</span>
                <span className="text-[7px] font-black uppercase tracking-widest">Leg bye</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setUndoOpen(true)}
                className="col-span-2 flex items-center justify-center gap-1.5 border border-border bg-card py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-300 transition-transform active:scale-95 hover:border-[#ef4444] hover:text-[#ef4444]"
              >
                <RotateCcw className="size-4" /> Undo
              </button>
              <button
                type="button"
                onClick={() => {
                  setStreamUrl(match.streamUrl ?? "");
                  setStreamOpen(true);
                }}
                className="col-span-2 flex items-center justify-center gap-1.5 border border-border bg-card py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-300 transition-transform active:scale-95 hover:border-[#22d3ee] hover:text-[#22d3ee]"
              >
                <Video className="size-4" /> Stream
              </button>
            </div>

            {/* recent balls */}
            <div className="mt-4 border border-border bg-card px-3 py-2.5">
              <MicroLabel className="mb-2 block text-slate-500">Last balls</MicroLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {current.recentBalls.length === 0 ? (
                  <span className="text-[11px] font-medium text-slate-600">No balls yet</span>
                ) : (
                  current.recentBalls.map((b) => <BallChip key={b.key} symbol={b.symbol} kind={b.kind} size="sm" />)
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* dialogs */}
      {wicketOpen && current && (
        <WicketDialog
          striker={striker}
          nonStriker={nonStriker}
          outPlayerIds={outPlayerIds}
          wicketsSoFar={current.wickets}
          superOver={current?.isSuperOver ?? false}
          battingSquad={battingSquadXI}
          bowlingSquad={bowlingSquadXI}
          onCancel={() => setWicketOpen(false)}
          onConfirm={async (payload) => {
            setBusy(true);
            try {
              await record({
                matchId: match.id as Id<"matches">,
                inningsId: current.id as Id<"innings">,
                bowlerId: (bowler?._id ?? payload.bowlerId) as Id<"players">,
                batsmanId: payload.dismissedBatterId as Id<"players">,
                nonStrikerId: nonStriker?._id as Id<"players"> | undefined,
                runsScored: 0,
                extraType: "none",
                extraRuns: 0,
                isWicket: true,
                wicketType: payload.wicketType,
                dismissedBatterId: payload.dismissedBatterId as Id<"players">,
                fielderId: payload.fielderId as Id<"players"> | undefined,
                newBatsmanId: payload.newBatsmanId as Id<"players"> | undefined,
              });
              toast.success("Wicket recorded.");
              setWicketOpen(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not record the wicket.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {extraOpen && current && (
        <ExtraDialog
          type={extraOpen}
          onCancel={() => setExtraOpen(null)}
          onConfirm={async ({ runsScored, extraRuns }) => {
            setBusy(true);
            try {
              await record({
                matchId: match.id as Id<"matches">,
                inningsId: current.id as Id<"innings">,
                bowlerId: (bowler?._id ?? "") as Id<"players">,
                batsmanId: (striker?._id ?? "") as Id<"players">,
                nonStrikerId: nonStriker?._id as Id<"players"> | undefined,
                runsScored,
                extraType: extraOpen,
                extraRuns,
                isWicket: false,
              });
              setExtraOpen(null);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not record the delivery.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {shotPending !== null && current && (
        <ShotDialog
          runs={shotPending}
          strikerName={striker?.name ?? ""}
          onCancel={() => setShotPending(null)}
          onConfirm={async (shotType, shotRegion) => {
            await recordShot(shotPending, shotType, shotRegion);
            setShotPending(null);
          }}
          onSkip={async () => {
            await recordShot(shotPending);
            setShotPending(null);
          }}
        />
      )}

      {undoOpen && (
        <Dialog open onOpenChange={(o) => !o && setUndoOpen(false)}>
          <DialogContent className="rounded-none border-border sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="uppercase text-white">Undo last ball?</DialogTitle>
              <DialogDescription>
                Removes the most recent ball of this innings. Use it to fix scorer
                entry errors.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" className="rounded-none border-border uppercase text-slate-300" onClick={() => setUndoOpen(false)}>
                Keep it
              </Button>
              <Button
                className="rounded-none bg-[#ef4444] uppercase text-white hover:bg-[#dc2626]"
                onClick={handleUndo}
                disabled={busy}
              >
                <RotateCcw className="size-4" /> Undo ball
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {bowlerOpen && current && (
        <Dialog open onOpenChange={(o) => !o && setBowlerOpen(false)}>
          <DialogContent className="rounded-none border-border sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="uppercase text-white">Change bowler</DialogTitle>
              <DialogDescription>
                Pick the bowler for the current over — the one who bowled the
                last over can't bowl two in a row, so they're not listed.
              </DialogDescription>
            </DialogHeader>
            <BowlerPicker
              squad={
                newOver && current?.lastOverBowlerId
                  ? bowlingSquadXI.filter(
                      (p) => String(p._id) !== String(current?.lastOverBowlerId),
                    )
                  : bowlingSquadXI
              }
              currentId={bowler?._id}
              onPick={async (playerId) => {
                setBusy(true);
                try {
                  await setBowlerM({
                    inningsId: current.id as Id<"innings">,
                    bowlerId: playerId as Id<"players">,
                  });
                  setBowlerOpen(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not change the bowler.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {streamOpen && (
        <Dialog open onOpenChange={(o) => !o && setStreamOpen(false)}>
          <DialogContent className="rounded-none border-border sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 uppercase text-white">
                <Clapperboard className="size-4 text-[#22d3ee]" /> Live stream link
              </DialogTitle>
              <DialogDescription>
                YouTube ID/URL or Twitch channel URL — updates the public match
                center instantly.
              </DialogDescription>
            </DialogHeader>
            <Input
              className="rounded-none border-border bg-panel text-slate-200"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
            />
            <DialogFooter>
              <Button variant="outline" className="rounded-none border-border uppercase text-slate-300" onClick={() => setStreamOpen(false)}>
                Cancel
              </Button>
              <Button className="rounded-none bg-[#22d3ee] uppercase text-[#083344] hover:bg-[#22c55e] hover:text-[#052e16]" onClick={handleSaveStream} disabled={busy}>
                Save stream
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </ScorerShell>
  );
}

// ============ shells & sub-panels ============

function ScorerShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      {children}
    </main>
  );
}

function StartInningsPanel({
  matchId,
  teamA,
  teamB,
  defaultBattingId = "",
  tossNote,
  teamAXI = [],
  teamBXI = [],
  onEditXI,
  onUndoToss,
}: {
  matchId: string;
  teamA: { _id: string; name: string; shortCode: string };
  teamB: { _id: string; name: string; shortCode: string };
  defaultBattingId?: string;
  tossNote?: string;
  teamAXI?: string[];
  teamBXI?: string[];
  onEditXI?: () => void;
  onUndoToss?: () => void;
}) {
  const startInnings = useMutation(api.scoring.startInnings);
  const [battingId, setBattingId] = useState<string>(defaultBattingId);
  // A saved toss decides the batting side — the scorer can still override it
  // (e.g. a mistyped toss) by tapping "Override toss".
  const [overrideToss, setOverrideToss] = useState(false);
  const [striker, setStriker] = useState("");
  const [nonStriker, setNonStriker] = useState("");
  const [bowler, setBowler] = useState("");
  const [busy, setBusy] = useState(false);
  const tossLocked = Boolean(defaultBattingId) && !overrideToss;
  const lockedBattingTeam = tossLocked
    ? defaultBattingId === teamA._id
      ? teamA
      : teamB
    : null;
  const lockedBowlingTeam = lockedBattingTeam
    ? lockedBattingTeam._id === teamA._id
      ? teamB
      : teamA
    : null;
  const battingSquad = useQuery(api.players.listByTeam, battingId ? { teamId: battingId as Id<"teams"> } : "skip");
  const bowlingId = battingId ? (battingId === teamA._id ? teamB._id : teamA._id) : "";
  const bowlingSquad = useQuery(api.players.listByTeam, bowlingId ? { teamId: bowlingId as Id<"teams"> } : "skip");
  // The scorer's pickers only list the locked-in XI of each team.
  const xiFor = (teamId: string) => (teamId === teamA._id ? teamAXI : teamBXI);
  const restrictToXI = (teamId: string, squad: PlayerDoc[] | undefined) => {
    const xi = xiFor(teamId);
    if (xi.length === 0) return squad ?? [];
    const set = new Set(xi.map((id) => String(id)));
    return (squad ?? []).filter((p) => set.has(String(p._id)));
  };
  const battingXI = restrictToXI(battingId, battingSquad);
  const bowlingXI = restrictToXI(bowlingId, bowlingSquad);

  const submit = async () => {
    if (!battingId || !striker || !nonStriker || !bowler) {
      toast.error("Pick the batting side, openers and first bowler.");
      return;
    }
    setBusy(true);
    try {
      const res = await startInnings({
        matchId: matchId as Id<"matches">,
        battingTeamId: battingId as Id<"teams">,
        bowlingTeamId: bowlingId as Id<"teams">,
        strikerId: striker as Id<"players">,
        nonStrikerId: nonStriker as Id<"players">,
        bowlerId: bowler as Id<"players">,
      });
      toast.success(res.number === 1 ? "1st innings underway!" : "2nd innings underway!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the innings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-2 border-[#22c55e] bg-card p-4 panel-glow">
      {tossNote && (
        <p className="mb-3 flex items-center gap-1.5 border border-[#facc15]/50 bg-[#422006]/40 px-3 py-2 text-[10px] font-extrabold uppercase tracking-widest text-[#facc15]">
          <Trophy className="size-3.5 shrink-0" /> {tossNote}
        </p>
      )}
      <MicroLabel className="text-[#22c55e]">Start innings</MicroLabel>
      <p className="mt-1 text-xs text-slate-500">
        Who bats first? Pick the opening pair and the first bowler.
      </p>
      {tossLocked && lockedBattingTeam && lockedBowlingTeam ? (
        <div className="mt-3 space-y-2">
          <p className="flex items-center justify-between gap-2 border-2 border-[#22c55e] bg-[#052e16]/50 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-[#22c55e]">
            <span className="truncate">{lockedBattingTeam.name} bat first</span>
            <Check className="size-4 shrink-0" />
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {lockedBowlingTeam.name} bowl first — decided by the toss
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setOverrideToss(true)}
              className="flex items-center justify-center gap-1 border border-border bg-card py-2 text-[8px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:border-[#facc15] hover:text-[#facc15]"
            >
              <RotateCcw className="size-2.5" /> Override
            </button>
            <button
              type="button"
              onClick={onEditXI}
              className="flex items-center justify-center gap-1 border border-border bg-card py-2 text-[8px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:border-[#22d3ee] hover:text-[#22d3ee]"
            >
              <Users className="size-2.5" /> Change XI
            </button>
            <button
              type="button"
              onClick={onUndoToss}
              className="flex items-center justify-center gap-1 border border-[#ef4444]/40 bg-card py-2 text-[8px] font-bold uppercase tracking-widest text-[#ef4444] transition-colors hover:border-[#ef4444] hover:bg-[#ef4444]/10"
            >
              <RotateCcw className="size-2.5" /> Undo toss
            </button>
          </div>
          <p className="text-center text-[8px] font-bold uppercase tracking-widest text-slate-600">
            Override = change batting side · Change XI = re-pick teams · Undo toss = redo the ceremony
          </p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[teamA, teamB].map((t) => (
            <button
              key={t._id}
              type="button"
              onClick={() => {
                setBattingId(t._id);
                setStriker("");
                setNonStriker("");
                setBowler("");
              }}
              className={cn(
                "border px-3 py-3 text-xs font-extrabold uppercase tracking-wide",
                battingId === t._id
                  ? "border-[#22c55e] bg-[#22c55e] text-[#052e16]"
                  : "border-border bg-card text-slate-300",
              )}
            >
              {t.name} bat
            </button>
          ))}
        </div>
      )}
      {battingId && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Picker label="Striker" value={striker} onChange={setStriker} players={battingXI} />
            <Picker label="Non-striker" value={nonStriker} onChange={setNonStriker} players={battingXI} />
          </div>
          <Picker label="First bowler" value={bowler} onChange={setBowler} players={bowlingXI} />
          <Button
            type="button"
            onClick={submit}
            disabled={busy}
            className="w-full rounded-none bg-[#22c55e] uppercase text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]"
          >
            Start match &amp; score
          </Button>
        </div>
      )}
    </div>
  );
}

/** After the toss: the scorer picks the playing XI (exactly 11) of both teams
 *  before any innings can start. Only these players can bat/bowl, and the XI
 *  is what viewers see on the public match center. */
function PlayingXIPanel({
  matchId,
  teamA,
  teamB,
  initialA = [],
  initialB = [],
  onUndoToss,
}: {
  matchId: string;
  teamA: { _id: string; name: string; shortCode: string; color: string };
  teamB: { _id: string; name: string; shortCode: string; color: string };
  initialA?: string[];
  initialB?: string[];
  onUndoToss?: () => void;
}) {
  const teamASquad = useQuery(api.players.listByTeam, { teamId: teamA._id as Id<"teams"> });
  const teamBSquad = useQuery(api.players.listByTeam, { teamId: teamB._id as Id<"teams"> });
  const setPlayingXI = useMutation(api.matches.setPlayingXI);
  const [selA, setSelA] = useState<string[]>(initialA);
  const [selB, setSelB] = useState<string[]>(initialB);
  const [busy, setBusy] = useState(false);

  const toggle = (prev: string[], id: string): string[] =>
    prev.includes(id)
      ? prev.filter((x) => x !== id)
      : prev.length >= 11
        ? prev
        : [...prev, id];

  const lock = async () => {
    if (selA.length !== 11 || selB.length !== 11) {
      toast.error("Pick exactly 11 players for each team.");
      return;
    }
    setBusy(true);
    try {
      await setPlayingXI({
        matchId: matchId as Id<"matches">,
        teamAXI: selA as Id<"players">[],
        teamBXI: selB as Id<"players">[],
      });
      toast.success("Playing XIs locked — set the crease to start.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the XIs.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-2 border-[#22d3ee] bg-card p-4 panel-glow">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-[#22d3ee]" />
        <MicroLabel className="text-[#22d3ee]">Pick the playing XI</MicroLabel>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Toss done — now pick 11 players for each team. Only these 11 can bat
        and bowl, so get both XIs right before the first ball.
      </p>

      <div className="mt-4 space-y-4">
        <XISelect
          team={teamA}
          squad={teamASquad ?? []}
          selected={selA}
          onToggle={(id) => setSelA((prev) => toggle(prev, id))}
        />
        <XISelect
          team={teamB}
          squad={teamBSquad ?? []}
          selected={selB}
          onToggle={(id) => setSelB((prev) => toggle(prev, id))}
        />
      </div>

      <Button
        type="button"
        onClick={lock}
        disabled={busy || selA.length !== 11 || selB.length !== 11}
        className="mt-4 w-full rounded-none bg-[#22c55e] py-4 text-xs font-black uppercase tracking-widest text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]"
      >
        <Check className="size-4" />
        {selA.length === 11 && selB.length === 11
          ? "Lock XIs & continue"
          : `Pick ${11 - selA.length} more for ${teamA.shortCode} · ${11 - selB.length} more for ${teamB.shortCode}`}
      </Button>
      {onUndoToss && (
        <button
          type="button"
          onClick={onUndoToss}
          className="mt-2 flex w-full items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-[#ef4444]"
        >
          <RotateCcw className="size-3" /> Undo toss &amp; redo the ceremony
        </button>
      )}
    </div>
  );
}

function XISelect({
  team,
  squad,
  selected,
  onToggle,
}: {
  team: { _id: string; name: string; shortCode: string; color: string };
  squad: PlayerDoc[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="border border-border bg-panel">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <span
          className="flex size-7 items-center justify-center text-[10px] font-black text-white"
          style={{ backgroundColor: team.color }}
        >
          {team.shortCode}
        </span>
        <span className="truncate text-xs font-extrabold uppercase tracking-tight text-white">{team.name}</span>
        <span
          className={cn(
            "ml-auto text-[10px] font-black uppercase tracking-widest",
            selected.length === 11 ? "text-[#22c55e]" : "text-[#facc15]",
          )}
        >
          {selected.length}/11
        </span>
      </div>
      <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto">
        {squad.map((p) => {
          const on = selected.includes(String(p._id));
          return (
            <li key={p._id}>
              <button
                type="button"
                onClick={() => onToggle(String(p._id))}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                  on ? "bg-[#22c55e]/10" : "hover:bg-panel-2",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center border",
                    on ? "border-[#22c55e] bg-[#22c55e] text-[#052e16]" : "border-border bg-card text-transparent",
                  )}
                >
                  <Check className="size-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-slate-100">{p.name}</span>
                  <span className="block truncate text-[9px] uppercase tracking-wider text-slate-500">
                    {[p.battingStyle, p.bowlingStyle].filter(Boolean).join(" · ") || "Bats & bowls"}
                  </span>
                </span>
                {(p.isCaptain || p.isViceCaptain) && (
                  <span
                    className={cn(
                      "shrink-0 text-[8px] font-black uppercase tracking-widest",
                      p.isCaptain ? "text-[#facc15]" : "text-[#22d3ee]",
                    )}
                  >
                    {p.isCaptain ? "C" : "VC"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Tied match → one-over eliminator. The team that batted second bats first. */
function SuperOverStartPanel({
  matchId,
  battingTeamId,
  bowlingTeamId,
}: {
  matchId: string;
  battingTeamId: Id<"teams">;
  bowlingTeamId: Id<"teams">;
}) {
  const startInnings = useMutation(api.scoring.startInnings);
  const [striker, setStriker] = useState("");
  const [nonStriker, setNonStriker] = useState("");
  const [bowler, setBowler] = useState("");
  const [busy, setBusy] = useState(false);
  const battingSquad = useQuery(
    api.players.listByTeam,
    battingTeamId ? { teamId: battingTeamId } : "skip",
  );
  const bowlingSquad = useQuery(
    api.players.listByTeam,
    bowlingTeamId ? { teamId: bowlingTeamId } : "skip",
  );

  const submit = async () => {
    if (!striker || !nonStriker || !bowler) {
      toast.error("Pick the two batters and the bowler for the Super Over.");
      return;
    }
    setBusy(true);
    try {
      await startInnings({
        matchId: matchId as Id<"matches">,
        battingTeamId,
        bowlingTeamId,
        strikerId: striker as Id<"players">,
        nonStrikerId: nonStriker as Id<"players">,
        bowlerId: bowler as Id<"players">,
      });
      toast.success("Super Over underway — 1 over each!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the Super Over.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-2 border-[#facc15] bg-card p-4 panel-glow">
      <MicroLabel className="text-[#facc15]">Match tied — Super Over</MicroLabel>
      <p className="mt-1 text-xs text-slate-500">
        One over each, 2 wickets per innings. The team that batted second in the
        match bats first now. Pick the pair and the bowler.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Picker label="Striker" value={striker} onChange={setStriker} players={battingSquad ?? []} />
        <Picker label="Non-striker" value={nonStriker} onChange={setNonStriker} players={battingSquad ?? []} />
      </div>
      <div className="mt-2">
        <Picker label="First bowler" value={bowler} onChange={setBowler} players={bowlingSquad ?? []} />
      </div>
      <Button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-3 w-full rounded-none bg-[#facc15] uppercase text-[#422006] hover:bg-[#22c55e] hover:text-[#052e16]"
      >
        Start Super Over
      </Button>
    </div>
  );
}

/** Used when innings 2 opens (or innings state was reset). */
function OpenersPanel({
  inningsId,
  battingSquad,
  bowlingSquad,
}: {
  inningsId: string;
  battingSquad: PlayerDoc[];
  bowlingSquad: PlayerDoc[];
}) {
  const setOpeners = useMutation(api.scoring.setOpenersAndBowler);
  const [striker, setStriker] = useState("");
  const [nonStriker, setNonStriker] = useState("");
  const [bowler, setBowler] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!striker || !nonStriker || !bowler) {
      toast.error("Pick the opening pair and the first bowler.");
      return;
    }
    setBusy(true);
    try {
      await setOpeners({
        inningsId: inningsId as Id<"innings">,
        strikerId: striker as Id<"players">,
        nonStrikerId: nonStriker as Id<"players">,
        bowlerId: bowler as Id<"players">,
      });
      toast.success("Crease set — start scoring!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set the crease.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-2 border-[#22d3ee] bg-card p-4 panel-glow">
      <MicroLabel className="text-[#22d3ee]">Set the crease</MicroLabel>
      <p className="mt-1 text-xs text-slate-500">
        New innings — pick the openers and the first bowler.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Picker label="Striker" value={striker} onChange={setStriker} players={battingSquad} />
        <Picker label="Non-striker" value={nonStriker} onChange={setNonStriker} players={battingSquad} />
      </div>
      <div className="mt-2">
        <Picker label="First bowler" value={bowler} onChange={setBowler} players={bowlingSquad} />
      </div>
      <Button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-3 w-full rounded-none bg-[#22d3ee] uppercase text-[#083344] hover:bg-[#22c55e] hover:text-[#052e16]"
      >
        Set &amp; start scoring
      </Button>
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  players,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  players: { _id: string; name: string }[];
}) {
  return (
    <div>
      <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="mt-1 h-10 rounded-none border-border bg-panel text-xs text-slate-200">
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent className="rounded-none border-border bg-card">
          {players.map((p) => (
            <SelectItem key={p._id} value={p._id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function WicketDialog({
  striker,
  nonStriker,
  outPlayerIds,
  wicketsSoFar,
  superOver,
  battingSquad,
  bowlingSquad,
  onCancel,
  onConfirm,
}: {
  striker: { _id: string; name: string } | null;
  nonStriker: { _id: string; name: string } | null;
  outPlayerIds: string[];
  wicketsSoFar: number;
  superOver: boolean;
  battingSquad: PlayerDoc[];
  bowlingSquad: PlayerDoc[];
  onCancel: () => void;
  onConfirm: (payload: {
    wicketType: WicketType;
    dismissedBatterId: string;
    newBatsmanId?: string;
    fielderId?: string;
    bowlerId: string;
  }) => Promise<void>;
}) {
  const [wicketType, setWicketType] = useState<WicketType>("Bowled");
  // Only the two batters at the crease can be dismissed — show striker and
  // non-striker, nothing else.
  const crease = [striker, nonStriker].filter(
    (p): p is { _id: string; name: string } => p != null,
  );
  const dismissedOptions = crease.length > 0 ? crease : battingSquad;
  const [dismissed, setDismissed] = useState<string>(
    striker?._id ?? dismissedOptions[0]?._id ?? "",
  );
  const [newBatsman, setNewBatsman] = useState("");
  const [fielder, setFielder] = useState("");
  const [busy, setBusy] = useState(false);

  // The 10th wicket ends a normal innings; a Super Over ends after 2 wickets.
  const isFinalWicket = wicketsSoFar + 1 >= (superOver ? 2 : 10);
  const needsFielder = wicketType === "Caught" || wicketType === "Run out" || wicketType === "Stumped";
  // Next batter: never someone already out, never the two at the crease.
  const excludedIds = new Set<string>([
    ...outPlayerIds.map((id) => String(id)),
    ...(striker ? [String(striker._id)] : []),
    ...(nonStriker ? [String(nonStriker._id)] : []),
  ]);
  const available = battingSquad.filter((p) => !excludedIds.has(String(p._id)));

  const submit = async () => {
    if (!dismissed) {
      toast.error("Choose the dismissed batter.");
      return;
    }
    if (!isFinalWicket && !newBatsman) {
      toast.error("Choose the replacement batter.");
      return;
    }
    setBusy(true);
    try {
      await onConfirm({
        wicketType,
        dismissedBatterId: dismissed,
        newBatsmanId: isFinalWicket ? undefined : newBatsman,
        fielderId: fielder || undefined,
        bowlerId: "",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-border sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="uppercase text-[#ef4444]">Wicket</DialogTitle>
          <DialogDescription>How was the batter dismissed?</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-2">
            {WICKET_TYPES.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWicketType(w)}
                className={cn(
                  "border px-2 py-2 text-[10px] font-extrabold uppercase tracking-wide",
                  wicketType === w
                    ? "border-[#ef4444] bg-[#ef4444] text-white"
                    : "border-border bg-card text-slate-400",
                )}
              >
                {w}
              </button>
            ))}
          </div>
          <Picker label="Dismissed batter" value={dismissed} onChange={setDismissed} players={dismissedOptions} />
          {isFinalWicket ? (
            <p className="border border-[#facc15]/50 bg-[#422006]/40 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#facc15]">
              {superOver ? "That's 2 wickets — Super Over over" : "That's the 10th wicket — innings over"}
            </p>
          ) : (
            <Picker label="New batter in" value={newBatsman} onChange={setNewBatsman} players={available} />
          )}
          {needsFielder && (
            <Picker label={`Fielder / keeper (${wicketType === "Stumped" ? "wk" : wicketType === "Caught" ? "catcher" : "thrower"})`} value={fielder} onChange={setFielder} players={bowlingSquad} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none border-border uppercase text-slate-300" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="rounded-none bg-[#ef4444] uppercase text-white hover:bg-[#dc2626]" onClick={submit} disabled={busy}>
            Record wicket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtraDialog({
  type,
  onCancel,
  onConfirm,
}: {
  type: ExtraType;
  onCancel: () => void;
  onConfirm: (payload: { runsScored: number; extraRuns: number }) => Promise<void>;
}) {
  const [runs, setRuns] = useState(0);
  const [busy, setBusy] = useState(false);

  const label =
    type === "wide"
      ? "Wide — total runs (incl. penalty)"
      : type === "noball"
        ? "No-ball — runs off the bat"
        : type === "bye"
          ? "Byes — runs taken"
          : "Leg-byes — runs taken";

  const submit = async () => {
    setBusy(true);
    try {
      if (type === "wide") {
        await onConfirm({ runsScored: 0, extraRuns: Math.max(1, runs) });
      } else if (type === "noball") {
        await onConfirm({ runsScored: runs, extraRuns: 1 });
      } else {
        await onConfirm({ runsScored: 0, extraRuns: Math.max(1, runs) });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="rounded-none border-border sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="uppercase text-white">
            {type === "wide" ? "Wide" : type === "noball" ? "No-ball" : type === "bye" ? "Bye" : "Leg-bye"}
          </DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-5 gap-2 py-2">
          {[0, 1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRuns(n)}
              className={cn(
                "score-nums border py-3 text-lg font-extrabold",
                runs === n
                  ? "border-[#facc15] bg-[#facc15] text-[#422006]"
                  : "border-border bg-card text-slate-300",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none border-border uppercase text-slate-300" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="rounded-none bg-[#facc15] uppercase text-[#422006] hover:bg-[#22c55e] hover:text-[#052e16]" onClick={submit} disabled={busy}>
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShotDialog({
  runs,
  strikerName,
  onCancel,
  onConfirm,
  onSkip,
}: {
  runs: number;
  strikerName: string;
  onCancel: () => void;
  onConfirm: (shotType: string, shotRegion: string) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [shotType, setShotType] = useState<string>("");
  const [shotRegion, setShotRegion] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!shotType || !shotRegion) {
      toast.error("Pick the shot and the area it went to.");
      return;
    }
    setBusy(true);
    try {
      await onConfirm(shotType, shotRegion);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="uppercase text-[#22c55e]">
            {runs} run{runs > 1 ? "s" : ""} — {strikerName}
          </DialogTitle>
          <DialogDescription>
            Which shot was it, and where on the ground did it go? This powers the
            wagon wheel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Shot played
            </Label>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {SHOT_TYPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setShotType(s)}
                  className={cn(
                    "border px-1.5 py-2 text-[10px] font-extrabold uppercase tracking-wide transition-colors",
                    shotType === s
                      ? "border-[#22c55e] bg-[#22c55e]/15 text-[#22c55e]"
                      : "border-border bg-panel text-slate-300 hover:border-slate-600",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Area of the ground
            </Label>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {SHOT_REGIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setShotRegion(r)}
                  className={cn(
                    "border px-1.5 py-2 text-[9px] font-bold uppercase tracking-wide transition-colors",
                    shotRegion === r
                      ? "border-[#22d3ee] bg-[#22d3ee]/15 text-[#22d3ee]"
                      : "border-border bg-panel text-slate-400 hover:border-slate-600",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-none border-border uppercase text-slate-300"
            onClick={() => void onSkip()}
            disabled={busy}
          >
            Skip tagging
          </Button>
          <Button
            type="button"
            className="rounded-none bg-[#22c55e] uppercase text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]"
            onClick={() => void submit()}
            disabled={busy}
          >
            Record {runs} run{runs > 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BowlerPicker({
  squad,
  currentId,
  onPick,
}: {
  squad: PlayerDoc[];
  currentId: string | undefined;
  onPick: (playerId: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="space-y-3">
      <Picker label="Bowler" value={value} onChange={setValue} players={squad} />
      <Button
        type="button"
        className="w-full rounded-none bg-[#22d3ee] uppercase text-[#083344] hover:bg-[#22c55e] hover:text-[#052e16]"
        disabled={!value || value === currentId}
        onClick={() => onPick(value)}
      >
        Set bowler
      </Button>
    </div>
  );
}

