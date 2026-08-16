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
import { AnimatePresence, motion } from "framer-motion";
import {
  bowlingLabel,
  useScorePopups,
  type PopupPlayer,
  type ScorePopup,
  type ScorePopupKind,
} from "@/hooks/use-score-popups";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  Clapperboard,
  KeyRound,
  RotateCcw,
  Video,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

type ExtraType = "wide" | "noball" | "bye" | "legbye";
type WicketType = "Bowled" | "Caught" | "Run out" | "Stumped" | "LBW";

interface PlayerDoc {
  _id: Id<"players">;
  teamId: Id<"teams">;
  name: string;
  role: "Batsman" | "Bowler" | "All-rounder";
}

const WICKET_TYPES: WicketType[] = ["Bowled", "Caught", "Run out", "Stumped", "LBW"];

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

        {!superOverReady && needsStart && (
          <StartInningsPanel matchId={match.id} teamA={teamA} teamB={teamB} />
        )}

        {needsOpeners && (
          <>
            <OpenersPanel inningsId={current.id} battingSquad={battingSquad ?? []} bowlingSquad={bowlingSquad ?? []} />
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
          strikerId={striker?._id ?? null}
          wicketsSoFar={current.wickets}
          superOver={current?.isSuperOver ?? false}
          battingSquad={battingSquad ?? []}
          bowlingSquad={bowlingSquad ?? []}
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
              <DialogDescription>Pick the bowler for the current over.</DialogDescription>
            </DialogHeader>
            <BowlerPicker
              squad={bowlingSquad ?? []}
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
}: {
  matchId: string;
  teamA: { _id: string; name: string; shortCode: string };
  teamB: { _id: string; name: string; shortCode: string };
}) {
  const startInnings = useMutation(api.scoring.startInnings);
  const [battingId, setBattingId] = useState<string>("");
  const [striker, setStriker] = useState("");
  const [nonStriker, setNonStriker] = useState("");
  const [bowler, setBowler] = useState("");
  const [busy, setBusy] = useState(false);
  const battingSquad = useQuery(api.players.listByTeam, battingId ? { teamId: battingId as Id<"teams"> } : "skip");
  const bowlingId = battingId ? (battingId === teamA._id ? teamB._id : teamA._id) : "";
  const bowlingSquad = useQuery(api.players.listByTeam, bowlingId ? { teamId: bowlingId as Id<"teams"> } : "skip");

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
      <MicroLabel className="text-[#22c55e]">Start innings</MicroLabel>
      <p className="mt-1 text-xs text-slate-500">
        Who bats first? Pick the opening pair and the first bowler.
      </p>
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
      {battingId && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Picker label="Striker" value={striker} onChange={setStriker} players={battingSquad ?? []} />
            <Picker label="Non-striker" value={nonStriker} onChange={setNonStriker} players={battingSquad ?? []} />
          </div>
          <Picker label="First bowler" value={bowler} onChange={setBowler} players={bowlingSquad ?? []} />
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
  players: PlayerDoc[];
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
              {p.name} · {p.role}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function WicketDialog({
  strikerId,
  wicketsSoFar,
  superOver,
  battingSquad,
  bowlingSquad,
  onCancel,
  onConfirm,
}: {
  strikerId: string | null;
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
  const [dismissed, setDismissed] = useState<string>(strikerId ?? "");
  const [newBatsman, setNewBatsman] = useState("");
  const [fielder, setFielder] = useState("");
  const [busy, setBusy] = useState(false);

  // The 10th wicket ends a normal innings; a Super Over ends after 2 wickets.
  const isFinalWicket = wicketsSoFar + 1 >= (superOver ? 2 : 10);
  const needsFielder = wicketType === "Caught" || wicketType === "Run out" || wicketType === "Stumped";
  const available = battingSquad.filter((p) => p._id !== dismissed);

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
          <Picker label="Dismissed batter" value={dismissed} onChange={setDismissed} players={battingSquad} />
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

// ---- live event popups -----------------------------------------------------

const POPUP_TONE: Record<ScorePopupKind, { bar: string; label: string; glow: string }> = {
  four: { bar: "#22c55e", label: "text-[#22c55e]", glow: "led-green" },
  six: { bar: "#facc15", label: "text-[#facc15]", glow: "led-gold" },
  wicket: { bar: "#ef4444", label: "text-[#ef4444]", glow: "led-red" },
  new_batter: { bar: "#22d3ee", label: "text-[#22d3ee]", glow: "led-cyan" },
  bowler: { bar: "#22d3ee", label: "text-[#22d3ee]", glow: "led-cyan" },
  milestone: { bar: "#facc15", label: "text-[#facc15]", glow: "led-gold" },
  team_milestone: { bar: "#22d3ee", label: "text-[#22d3ee]", glow: "led-cyan" },
  innings: { bar: "#facc15", label: "text-[#facc15]", glow: "led-gold" },
  result: { bar: "#22c55e", label: "text-[#22c55e]", glow: "led-green" },
  superover: { bar: "#a78bfa", label: "text-[#a78bfa]", glow: "" },
};

function ScorePopupStage({ popups }: { popups: ScorePopup[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3">
      <AnimatePresence>
        {popups.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: -28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="w-full max-w-md"
          >
            <ScorePopupCard popup={p} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ScorePopupCard({ popup }: { popup: ScorePopup }) {
  const tone = POPUP_TONE[popup.kind] ?? POPUP_TONE.milestone;
  return (
    <div
      className="overflow-hidden border border-border bg-card shadow-2xl"
      style={{ animation: "pop-in 0.22s ease-out" }}
    >
      <div className="h-1" style={{ backgroundColor: tone.bar }} />
      <div className="flex items-center gap-3 p-3">
        {popup.player ? (
          <PlayerAvatar player={popup.player} color={popup.player.teamColor} />
        ) : (
          <span
            className="flex size-11 shrink-0 items-center justify-center border border-border bg-panel text-lg font-black"
            style={{ color: tone.bar }}
          >
            {popup.title.charAt(0)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-black uppercase tracking-tight", tone.label, tone.glow)}>
            {popup.title}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {popup.message}
          </p>
          {popup.player && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {popup.player.role && <ProfileChip label={popup.player.role} />}
              {popup.player.battingStyle && <ProfileChip label={popup.player.battingStyle} />}
              {bowlingLabel(popup.player.bowlingStyle) && (
                <ProfileChip label={bowlingLabel(popup.player.bowlingStyle)!} />
              )}
              {popup.player.jerseyNumber != null && popup.player.jerseyNumber > 0 && (
                <ProfileChip label={`#${popup.player.jerseyNumber}`} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerAvatar({ player, color }: { player: PopupPlayer; color?: string }) {
  return (
    <span
      className="popup-avatar relative flex size-11 shrink-0 items-center justify-center rounded-full border-2 text-base font-black text-white"
      style={{ backgroundColor: color ?? "#334155", borderColor: color ?? "#334155" }}
    >
      {player.name.charAt(0).toUpperCase()}
    </span>
  );
}

function ProfileChip({ label }: { label: string }) {
  return (
    <span className="border border-border bg-panel px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-slate-300">
      {label}
    </span>
  );
}
