// TossFlow.tsx — the pre-match toss ceremony with an Indian ₹10 coin.
// The WEBSITE performs the toss: first the admin picks which team calls the
// toss, that team chooses heads or tails, then one tap flips the coin at
// random. If the coin lands on the caller's call they win the toss; otherwise
// the other team does. The winner picks bat or bowl. The outcome is persisted
// with matches.setToss so the public match center only shows "X won the toss
// and chose to bat/bowl" — viewers never learn whether it came up heads/tails.

import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { motion } from "framer-motion";
import { Coins, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MicroLabel } from "@/components/swiss";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

type Side = "heads" | "tails";

interface TeamLite {
  _id: string;
  name: string;
  shortCode: string;
  color: string;
}

/** 24 spokes of the Ashoka Chakra, rotated every 15°. */
const SPOKE_DEGREES = Array.from({ length: 24 }, (_, i) => i * 15);

// ---------------------------------------------------------------------------
// The ₹10 coin faces — heads carries the Ashoka Chakra, tails the denomination
// ---------------------------------------------------------------------------

function HeadsFace({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-label="₹10 coin heads — Ashoka Chakra"
      className="block"
    >
      <defs>
        <linearGradient id="heads-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="45%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#heads-gold)" stroke="#a16207" strokeWidth="1.4" />
      <circle cx="50" cy="50" r="40" fill="#fef3c7" stroke="#b45309" strokeWidth="1" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="#92400e" strokeWidth="1.3" />
      <g stroke="#92400e" strokeWidth="1.8" strokeLinecap="round">
        {SPOKE_DEGREES.map((deg) => (
          <line key={deg} x1="50" y1="42" x2="50" y2="19" transform={`rotate(${deg} 50 50)`} />
        ))}
      </g>
      <circle cx="50" cy="50" r="9" fill="#fef3c7" stroke="#92400e" strokeWidth="1.4" />
      <text x="50" y="61" textAnchor="middle" fontSize="10" fontWeight="700" fill="#78350f">
        भारत
      </text>
      <text x="50" y="71" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#92400e" letterSpacing="1.5">
        INDIA
      </text>
    </svg>
  );
}

function TailsFace({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-label="₹10 coin tails — ten rupees"
      className="block"
    >
      <defs>
        <linearGradient id="tails-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="45%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#tails-gold)" stroke="#a16207" strokeWidth="1.4" />
      <circle cx="50" cy="50" r="40" fill="#fef3c7" stroke="#b45309" strokeWidth="1" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="#92400e" strokeWidth="1.2" strokeDasharray="2 2.5" />
      <text x="50" y="45" textAnchor="middle" fontSize="26" fontWeight="800" fill="#78350f">
        ₹
      </text>
      <text x="50" y="67" textAnchor="middle" fontSize="21" fontWeight="800" fill="#78350f">
        10
      </text>
      <text x="50" y="80" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#92400e" letterSpacing="1.5">
        TEN RUPEES
      </text>
      <text x="50" y="89" textAnchor="middle" fontSize="5" fontWeight="600" fill="#92400e">
        दस रुपये
      </text>
    </svg>
  );
}

/** A static (non-flipping) coin showing one face. */
function RupeeCoin({ side, size = 64 }: { side: Side; size?: number }) {
  return side === "heads" ? <HeadsFace size={size} /> : <TailsFace size={size} />;
}

/**
 * The flipping coin — two faces on a preserve-3d wrapper. `result` decides the
 * final resting face (5 full spins + 0° for heads, + 180° for tails).
 */
function Coin3D({ result, spinning, size = 148 }: { result: Side; spinning: boolean; size?: number }) {
  const finalDeg = result === "tails" ? 1980 : 1800; // 5 spins
  return (
    <div style={{ perspective: 900, width: size, height: size }} className="mx-auto">
      <motion.div
        initial={spinning ? { rotateX: 0, y: 0 } : { rotateX: finalDeg, y: 0 }}
        animate={
          spinning
            ? { rotateX: finalDeg, y: [0, -64, 0, -26, 0] }
            : { rotateX: finalDeg }
        }
        transition={
          spinning
            ? { duration: 2.2, ease: [0.22, 0.61, 0.36, 1] }
            : { duration: 0.3 }
        }
        style={{
          width: size,
          height: size,
          transformStyle: "preserve-3d",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <HeadsFace size={size} />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateX(180deg)",
          }}
        >
          <TailsFace size={size} />
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toss flow: caller → call (heads/tails) → flipping → result (winner picks bat/bowl)
// ---------------------------------------------------------------------------

export default function TossFlow({
  matchId,
  teamA,
  teamB,
}: {
  matchId: string;
  teamA: TeamLite;
  teamB: TeamLite;
}) {
  const setToss = useMutation(api.matches.setToss);
  const [step, setStep] = useState<"caller" | "pick" | "flipping" | "result">("caller");
  const [callingTeam, setCallingTeam] = useState<TeamLite | null>(null);
  const [callSide, setCallSide] = useState<Side | null>(null);
  const [result, setResult] = useState<Side | null>(null);
  const [saving, setSaving] = useState(false);

  const otherTeam = callingTeam
    ? callingTeam._id === teamA._id
      ? teamB
      : teamA
    : null;
  // The caller wins only when the coin lands on their call.
  const winner =
    result && callingTeam && callSide
      ? result === callSide
        ? callingTeam
        : otherTeam
      : null;
  const loser = winner ? (winner._id === teamA._id ? teamB : teamA) : null;

  const startFlip = () => {
    if (saving || !callSide) return;
    const r: Side = Math.random() < 0.5 ? "heads" : "tails";
    setResult(r);
    setStep("flipping");
    window.setTimeout(() => setStep("result"), 2400);
  };

  const chooseDecision = async (decision: "bat" | "bowl") => {
    if (!winner || saving) return;
    setSaving(true);
    try {
      await setToss({
        matchId: matchId as Id<"matches">,
        tossWinnerId: winner._id as Id<"teams">,
        tossDecision: decision,
      });
      toast.success(`${winner.name} won the toss and chose to ${decision} first.`);
      // The scorecard subscription re-renders with the saved toss and swaps this
      // ceremony for the "start innings" panel, locked to the toss decision.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the toss.");
      setSaving(false);
    }
  };

  const resetToss = () => {
    setCallingTeam(null);
    setCallSide(null);
    setResult(null);
    setStep("caller");
  };

  return (
    <div className="border-2 border-[#facc15] bg-card p-4 panel-glow">
      <div className="flex items-center gap-2">
        <Coins className="size-4 text-[#facc15]" />
        <MicroLabel className="text-[#facc15]">Toss time</MicroLabel>
      </div>

      {/* ---- step 1: pick which team calls --------------------------------- */}
      {step === "caller" && (
        <>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            A real toss with a real ₹10 coin. Pick which team calls — they
            choose heads or tails, then the website flips the coin live.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[teamA, teamB].map((team) => (
              <button
                key={team._id}
                type="button"
                onClick={() => {
                  setCallingTeam(team);
                  setCallSide(null);
                  setStep("pick");
                }}
                className="flex flex-col items-center gap-2 border border-border bg-card px-3 py-4 transition-colors hover:border-[#facc15]"
              >
                <span
                  className="flex size-10 items-center justify-center text-xs font-black text-white"
                  style={{ backgroundColor: team.color }}
                >
                  {team.shortCode}
                </span>
                <span className="block w-full truncate text-center text-[10px] font-extrabold uppercase tracking-wide text-slate-200">
                  {team.name}
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#facc15]">
                  calls the toss
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[9px] font-bold uppercase tracking-widest text-slate-500">
            The flip is decided here, live — winner chooses bat or bowl
          </p>
        </>
      )}

      {/* ---- step 2: the caller picks heads or tails ------------------------ */}
      {step === "pick" && callingTeam && (
        <>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            <span className="font-extrabold uppercase tracking-wide text-slate-200">
              {callingTeam.name}
            </span>{" "}
            — call heads or tails. The other side goes to {otherTeam?.name}.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(["heads", "tails"] as Side[]).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setCallSide(side)}
                className={cn(
                  "flex flex-col items-center gap-2 border px-3 py-4 transition-colors",
                  callSide === side
                    ? "border-[#facc15] bg-[#422006]"
                    : "border-border bg-card hover:border-[#facc15]",
                )}
              >
                <RupeeCoin side={side} size={56} />
                <span
                  className={cn(
                    "text-[9px] font-black uppercase tracking-widest",
                    side === "heads" ? "text-[#facc15]" : "text-[#22d3ee]",
                  )}
                >
                  {side === "heads" ? "Heads · Chakra" : "Tails · ₹10"}
                </span>
              </button>
            ))}
          </div>
          <Button
            type="button"
            onClick={startFlip}
            disabled={!callSide || saving}
            className="mt-3 w-full rounded-none bg-[#facc15] py-4 text-xs font-black uppercase tracking-widest text-[#422006] hover:bg-[#22c55e] hover:text-[#052e16]"
          >
            <Coins className="size-4" />
            {callingTeam.shortCode} call {callSide ? callSide.toUpperCase() : "…"} — flip the ₹10 coin
          </Button>
          <button
            type="button"
            onClick={resetToss}
            className="mt-2 flex w-full items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-[#22d3ee]"
          >
            <RotateCw className="size-3" /> Change caller
          </button>
        </>
      )}

      {/* ---- step 3: flipping ---------------------------------------------- */}
      {step === "flipping" && result && (
        <div className="mt-4 flex flex-col items-center gap-4 py-2 text-center">
          <Coin3D result={result} spinning />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#facc15]">
              Tossing the coin
            </p>
            <p className="mt-1 animate-pulse text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {callingTeam?.shortCode} called {callSide?.toUpperCase()} — the website decides…
            </p>
          </div>
        </div>
      )}

      {/* ---- step 4: result + decision ------------------------------------- */}
      {step === "result" && winner && loser && result && (
        <>
          <div className="mt-4 flex flex-col items-center gap-4 py-1 text-center">
            <Coin3D result={result} spinning={false} />
            <div>
              <p className="micro-label text-[#facc15]">
                It's {result === "heads" ? "HEADS" : "TAILS"}!
              </p>
              <p className="mt-1 text-sm font-extrabold uppercase tracking-tight text-white">
                {winner.name} win the toss
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {callingTeam?.name} called {callSide === "heads" ? "heads" : "tails"} — {result === callSide ? "call matches!" : "no match, coin decides"}
              </p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {winner.shortCode} choose · {loser.shortCode} take the field
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              type="button"
              disabled={saving}
              onClick={() => void chooseDecision("bat")}
              className="rounded-none bg-[#22c55e] py-4 text-[10px] font-black uppercase tracking-widest text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]"
            >
              🏏 {winner.shortCode} — bat first
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void chooseDecision("bowl")}
              className="rounded-none bg-[#22d3ee] py-4 text-[10px] font-black uppercase tracking-widest text-[#083344] hover:bg-[#facc15] hover:text-[#422006]"
            >
              ⚾ {winner.shortCode} — bowl first
            </Button>
          </div>
          <p className="mt-2 text-center text-[9px] font-bold uppercase tracking-widest text-slate-500">
            {saving ? "Locking in the toss…" : "Winner's call — decide bat or bowl"}
          </p>
          {!saving && (
            <button
              type="button"
              onClick={resetToss}
              className="mt-2 flex w-full items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-[#22d3ee]"
            >
              <RotateCw className="size-3" /> Re-toss the coin
            </button>
          )}
        </>
      )}
    </div>
  );
}
