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
  Check,
  Clapperboard,
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
  const scorecard = useQuery(api.scorecard.get, matchId ? { matchId } : "skip");

  const current = scorecard?.currentInnings ?? null;
  const battingTeamId = current?.battingTeam.id;
  const bowlingTeamId = current?.bowlingTeam.id;
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

  const [busy, setBusy] = useState(false);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState<ExtraType | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [bowlerOpen, setBowlerOpen] = useState(false);
  const [streamOpen, setStreamOpen] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");

  if (scorecard === undefined) {
    return <ScorerShell><div className="h-10 w-10 animate-spin border-2 border-foreground border-t-transparent" /></ScorerShell>;
  }
  if (scorecard === null) {
    return (
      <ScorerShell>
        <p className="border border-foreground bg-white px-4 py-10 text-center text-xs font-bold uppercase tracking-widest text-foreground/40">
          Match not found
        </p>
      </ScorerShell>
    );
  }

  const { match, teamA, teamB } = scorecard;
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
        matchId: match.id,
        inningsId: current.id,
        bowlerId: bowler._id,
        batsmanId: striker._id,
        nonStrikerId: nonStriker?._id,
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
      const res = await undo({ matchId: match.id, inningsId: current.id });
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
        inningsId: current.id,
        strikerId: nonStriker._id,
        nonStrikerId: striker._id,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not swap strike.");
    }
  };

  const handleSaveStream = async () => {
    setBusy(true);
    try {
      await updateStream({ matchId: match.id, streamUrl: streamUrl.trim() });
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
      <div className="flex items-center justify-between gap-3 border-b border-foreground bg-foreground px-4 py-3 text-white">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white">
          <ArrowLeft className="size-3.5" /> Console
        </Link>
        <span className="truncate text-xs font-extrabold uppercase tracking-tight">
          {teamA.shortCode} v {teamB.shortCode}
        </span>
        <Link to={`/matches/${match.id}`} className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#E4002B] hover:text-white">
          Public <ArrowLeftRight className="size-3.5" />
        </Link>
      </div>

      {/* score strip */}
      <div className="border-b border-foreground bg-white px-4 py-3">
        {match.result ? (
          <p className="text-sm font-extrabold uppercase tracking-wide text-[#E4002B]">{match.result}</p>
        ) : current ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="score-nums text-xl font-extrabold">
              {current.battingTeam.shortCode}{" "}
              {current.totalRuns}/{current.wickets}
              <span className="ml-1.5 text-xs font-bold text-foreground/50">
                ({formatOvers(current.ballsBowled)} ov)
              </span>
            </p>
            <div className="flex items-center gap-3 score-nums text-[11px] font-bold text-foreground/60">
              {current.target != null && <span>Target {current.target}</span>}
              <span>CRR {current.crr}</span>
              {current.rrr != null && <span>RRR {current.rrr}</span>}
            </div>
          </div>
        ) : (
          <p className="text-sm font-extrabold uppercase tracking-wide">Upcoming fixture</p>
        )}
      </div>

      {/* main */}
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        {matchOver && (
          <div className="mb-4 border-2 border-[#E4002B] bg-white p-4 text-center">
            <MicroLabel className="text-[#E4002B]">Match complete</MicroLabel>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-foreground/60">
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
            <div className="grid grid-cols-3 gap-px border border-foreground bg-foreground">
              <div className="bg-white px-3 py-3">
                <MicroLabel className="text-[#002FA7]">Striker</MicroLabel>
                <p className="mt-1 truncate text-sm font-extrabold">{strikerCard?.name ?? striker?.name ?? "—"}</p>
                <p className="score-nums text-[11px] font-bold text-foreground/55">
                  {strikerCard ? `${strikerCard.runs} (${strikerCard.balls}) · ${strikerCard.sr} SR` : "—"}
                </p>
              </div>
              <div className="bg-white px-3 py-3">
                <MicroLabel className="text-foreground/50">Non-striker</MicroLabel>
                <p className="mt-1 truncate text-sm font-extrabold">{nonStrikerCard?.name ?? nonStriker?.name ?? "—"}</p>
                <p className="score-nums text-[11px] font-bold text-foreground/55">
                  {nonStrikerCard ? `${nonStrikerCard.runs} (${nonStrikerCard.balls})` : "—"}
                </p>
              </div>
              <div className="bg-white px-3 py-3">
                <MicroLabel className="text-[#E4002B]">Bowler</MicroLabel>
                <p className="mt-1 truncate text-sm font-extrabold">{bowler?.name ?? "—"}</p>
                <p className="score-nums text-[11px] font-bold text-foreground/55">
                  {bowlerCard ? `${bowlerCard.overs}-${bowlerCard.maidens}-${bowlerCard.runs}-${bowlerCard.wickets}` : "—"}
                </p>
              </div>
            </div>

            {/* over + quick actions */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {newOver ? (
                <span className="inline-flex items-center gap-2 border-2 border-[#E4002B] bg-white px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#E4002B]">
                  New over — set bowler <Check className="size-3.5" />
                </span>
              ) : (
                <span className="score-nums border border-foreground bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-foreground/60">
                  Over {current.oversLabel} · {6 - (current.ballsBowled % 6 || 6)} balls left
                </span>
              )}
              <button
                type="button"
                onClick={() => setBowlerOpen(true)}
                className="border border-foreground bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-foreground hover:text-white"
              >
                Change bowler
              </button>
              <button
                type="button"
                onClick={handleSwap}
                disabled={!striker || !nonStriker}
                className="border border-foreground bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-foreground hover:text-white disabled:opacity-40"
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
                      ? "bg-[#002FA7] text-white hover:bg-[#002FA7]/85"
                      : "bg-foreground text-white hover:bg-black/80",
                  )}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => setWicketOpen(true)}
                className="score-nums bg-[#E4002B] py-5 text-2xl font-extrabold text-white transition-transform active:scale-95 hover:bg-[#E4002B]/85"
              >
                W
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setExtraOpen("wide")}
                className="border-2 border-[#E4002B] bg-white text-sm font-extrabold text-[#E4002B] transition-transform active:scale-95"
              >
                WD
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setExtraOpen("noball")}
                className="border-2 border-[#002FA7] bg-white text-sm font-extrabold text-[#002FA7] transition-transform active:scale-95"
              >
                NB
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setExtraOpen("bye")}
                className="border border-foreground bg-white text-sm font-extrabold text-foreground transition-transform active:scale-95"
              >
                BYE
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setExtraOpen("legbye")}
                className="border border-foreground bg-white text-sm font-extrabold text-foreground transition-transform active:scale-95"
              >
                LB
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setUndoOpen(true)}
                className="col-span-2 flex items-center justify-center gap-1.5 border border-foreground bg-muted py-3 text-[11px] font-extrabold uppercase tracking-widest text-foreground transition-transform active:scale-95 hover:bg-foreground hover:text-white"
              >
                <RotateCcw className="size-4" /> Undo
              </button>
              <button
                type="button"
                onClick={() => {
                  setStreamUrl(match.streamUrl ?? "");
                  setStreamOpen(true);
                }}
                className="col-span-2 flex items-center justify-center gap-1.5 border border-foreground bg-white py-3 text-[11px] font-extrabold uppercase tracking-widest hover:bg-[#002FA7] hover:text-white"
              >
                <Video className="size-4" /> Stream
              </button>
            </div>

            {/* recent balls */}
            <div className="mt-4 border border-foreground bg-white px-3 py-2.5">
              <MicroLabel className="mb-2 block text-foreground/50">Last balls</MicroLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {current.recentBalls.length === 0 ? (
                  <span className="text-[11px] font-medium text-foreground/40">No balls yet</span>
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
                matchId: match.id,
                inningsId: current.id,
                bowlerId: bowler?._id ?? payload.bowlerId,
                batsmanId: payload.dismissedBatterId,
                nonStrikerId: nonStriker?._id,
                runsScored: 0,
                extraType: "none",
                extraRuns: 0,
                isWicket: true,
                wicketType: payload.wicketType,
                dismissedBatterId: payload.dismissedBatterId,
                fielderId: payload.fielderId,
                newBatsmanId: payload.newBatsmanId,
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
                matchId: match.id,
                inningsId: current.id,
                bowlerId: bowler?._id ?? "",
                batsmanId: striker?._id ?? "",
                nonStrikerId: nonStriker?._id,
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
          <DialogContent className="rounded-none sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="uppercase">Undo last ball?</DialogTitle>
              <DialogDescription>
                Removes the most recent ball of this innings. Use it to fix scorer
                entry errors.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" className="rounded-none uppercase" onClick={() => setUndoOpen(false)}>
                Keep it
              </Button>
              <Button
                className="rounded-none bg-[#E4002B] uppercase text-white hover:bg-foreground"
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
          <DialogContent className="rounded-none sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="uppercase">Change bowler</DialogTitle>
              <DialogDescription>Pick the bowler for the current over.</DialogDescription>
            </DialogHeader>
            <BowlerPicker
              squad={bowlingSquad ?? []}
              currentId={bowler?._id}
              onPick={async (playerId) => {
                setBusy(true);
                try {
                  await setBowlerM({ inningsId: current.id, bowlerId: playerId });
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
          <DialogContent className="rounded-none sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 uppercase">
                <Clapperboard className="size-4" /> Live stream link
              </DialogTitle>
              <DialogDescription>
                YouTube ID/URL or Twitch channel URL — updates the public match
                center instantly.
              </DialogDescription>
            </DialogHeader>
            <Input
              className="rounded-none"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
            />
            <DialogFooter>
              <Button variant="outline" className="rounded-none uppercase" onClick={() => setStreamOpen(false)}>
                Cancel
              </Button>
              <Button className="rounded-none bg-[#002FA7] uppercase text-white hover:bg-foreground" onClick={handleSaveStream} disabled={busy}>
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
    <main className="flex min-h-screen flex-col bg-muted/40 text-foreground">
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
  teamA: { id: string; name: string; shortCode: string };
  teamB: { id: string; name: string; shortCode: string };
}) {
  const startInnings = useMutation(api.scoring.startInnings);
  const [battingId, setBattingId] = useState<string>("");
  const [striker, setStriker] = useState("");
  const [nonStriker, setNonStriker] = useState("");
  const [bowler, setBowler] = useState("");
  const [busy, setBusy] = useState(false);
  const battingSquad = useQuery(api.players.listByTeam, battingId ? { teamId: battingId } : "skip");
  const bowlingId = battingId ? (battingId === teamA.id ? teamB.id : teamA.id) : "";
  const bowlingSquad = useQuery(api.players.listByTeam, bowlingId ? { teamId: bowlingId } : "skip");

  const submit = async () => {
    if (!battingId || !striker || !nonStriker || !bowler) {
      toast.error("Pick the batting side, openers and first bowler.");
      return;
    }
    setBusy(true);
    try {
      const res = await startInnings({
        matchId,
        battingTeamId: battingId,
        bowlingTeamId: bowlingId,
        strikerId: striker,
        nonStrikerId: nonStriker,
        bowlerId: bowler,
      });
      toast.success(res.number === 1 ? "1st innings underway!" : "2nd innings underway!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the innings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-2 border-[#E4002B] bg-white p-4">
      <MicroLabel className="text-[#E4002B]">Start innings</MicroLabel>
      <p className="mt-1 text-xs text-foreground/60">
        Who bats first? Pick the opening pair and the first bowler.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[teamA, teamB].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setBattingId(t.id);
              setStriker("");
              setNonStriker("");
              setBowler("");
            }}
            className={cn(
              "border px-3 py-3 text-xs font-extrabold uppercase tracking-wide",
              battingId === t.id
                ? "border-[#E4002B] bg-[#E4002B] text-white"
                : "border-foreground bg-white text-foreground",
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
            className="w-full rounded-none bg-[#E4002B] uppercase text-white hover:bg-foreground"
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
      await setOpeners({ inningsId, strikerId: striker, nonStrikerId: nonStriker, bowlerId: bowler });
      toast.success("Crease set — start scoring!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set the crease.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-2 border-[#002FA7] bg-white p-4">
      <MicroLabel className="text-[#002FA7]">Set the crease</MicroLabel>
      <p className="mt-1 text-xs text-foreground/60">
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
        className="mt-3 w-full rounded-none bg-[#002FA7] uppercase text-white hover:bg-foreground"
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
      <Label className="text-[9px] font-bold uppercase tracking-widest text-foreground/50">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="mt-1 h-10 rounded-none bg-white text-xs">
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
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
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="uppercase text-[#E4002B]">Wicket</DialogTitle>
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
                    ? "border-[#E4002B] bg-[#E4002B] text-white"
                    : "border-foreground bg-white text-foreground/60",
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
          <Button variant="outline" className="rounded-none uppercase" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="rounded-none bg-[#E4002B] uppercase text-white hover:bg-foreground" onClick={submit} disabled={busy}>
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
      <DialogContent className="rounded-none sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="uppercase">
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
                  ? "border-[#E4002B] bg-[#E4002B] text-white"
                  : "border-foreground bg-white",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none uppercase" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="rounded-none bg-[#E4002B] uppercase text-white hover:bg-foreground" onClick={submit} disabled={busy}>
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
        className="w-full rounded-none bg-foreground uppercase text-white hover:bg-[#002FA7]"
        disabled={!value || value === currentId}
        onClick={() => onPick(value)}
      >
        Set bowler
      </Button>
    </div>
  );
}
