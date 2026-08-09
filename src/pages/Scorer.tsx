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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatOvers } from "@/lib/vpl";
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
  const matchOver = current?.isComplete && current.number === 2;

  const strikerCard = current?.batters.find((b) => b.isStriker);
  const nonStrikerCard = current?.batters.find((b) => b.isNonStriker);
  const bowlerCard = current?.bowlers.find((b) => b.playerId === bowler?._id);

  const tap = async (runs: number) => {
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
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the ball.");
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const res = await undo({
        matchId: match.id as Id<"matches">,
        inningsId: current.id as Id<"innings">,
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
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-[#0b1524] px-4 py-3">
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
        <Link to={`/matches/${match.id}`} className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#22c55e] hover:text-white">
          Public <ArrowLeftRight className="size-3.5" />
        </Link>
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

        {needsStart && (
          <StartInningsPanel matchId={match.id} teamA={teamA} teamB={teamB} />
        )}

        {needsOpeners && (
          <OpenersPanel inningsId={current.id} battingSquad={battingSquad ?? []} bowlingSquad={bowlingSquad ?? []} />
        )}

        {!needsStart && !needsOpeners && current && (
          <>
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

            {/* keypad */}
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[0, 1, 2, 3, 4, 6].map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={busy}
                  onClick={() => tap(r)}
                  className={cn(
                    "score-nums py-5 text-2xl font-extrabold transition-transform active:scale-95",
                    r === 4 || r === 6
                      ? "bg-[#22c55e] text-[#052e16] glow-green hover:bg-[#4ade80]"
                      : "bg-[#0b1524] text-white hover:bg-slate-800",
                  )}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => setWicketOpen(true)}
                className="score-nums bg-[#ef4444] py-5 text-2xl font-extrabold text-white transition-transform active:scale-95 glow-red hover:bg-[#dc2626]"
              >
                W
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setExtraOpen("wide")}
                className="border-2 border-[#facc15] bg-[#422006] text-sm font-extrabold text-[#facc15] transition-transform active:scale-95"
              >
                WD
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setExtraOpen("noball")}
                className="border-2 border-[#22d3ee] bg-[#083344] text-sm font-extrabold text-[#22d3ee] transition-transform active:scale-95"
              >
                NB
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setExtraOpen("bye")}
                className="border border-border bg-card text-sm font-extrabold text-slate-300 transition-transform active:scale-95"
              >
                BYE
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setExtraOpen("legbye")}
                className="border border-border bg-card text-sm font-extrabold text-slate-300 transition-transform active:scale-95"
              >
                LB
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
          inningsId={current.id}
          strikerId={striker?._id ?? null}
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
                newBatsmanId: payload.newBatsmanId as Id<"players">,
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

      {undoOpen && current && (
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
              className="rounded-none border-border bg-[#0b1524] text-slate-200"
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
        <SelectTrigger className="mt-1 h-10 rounded-none border-border bg-[#0b1524] text-xs text-slate-200">
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
  inningsId,
  strikerId,
  battingSquad,
  bowlingSquad,
  onCancel,
  onConfirm,
}: {
  inningsId: string;
  strikerId: string | null;
  battingSquad: PlayerDoc[];
  bowlingSquad: PlayerDoc[];
  onCancel: () => void;
  onConfirm: (payload: {
    wicketType: WicketType;
    dismissedBatterId: string;
    newBatsmanId: string;
    fielderId?: string;
    bowlerId: string;
  }) => Promise<void>;
}) {
  const [wicketType, setWicketType] = useState<WicketType>("Bowled");
  const [dismissed, setDismissed] = useState<string>(strikerId ?? "");
  const [newBatsman, setNewBatsman] = useState("");
  const [fielder, setFielder] = useState("");
  const [busy, setBusy] = useState(false);

  const needsFielder = wicketType === "Caught" || wicketType === "Run out" || wicketType === "Stumped";
  const available = battingSquad.filter((p) => p._id !== dismissed);

  const submit = async () => {
    if (!dismissed || !newBatsman) {
      toast.error("Choose the dismissed batter and the replacement.");
      return;
    }
    setBusy(true);
    try {
      await onConfirm({
        wicketType,
        dismissedBatterId: dismissed,
        newBatsmanId: newBatsman,
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
          <Picker label="New batter in" value={newBatsman} onChange={setNewBatsman} players={available} />
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
