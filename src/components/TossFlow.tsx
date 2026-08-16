// TossFlow.tsx — the pre-match toss ceremony with an Indian ₹10 coin.
// The scorer picks which captain calls the toss, the caller chooses heads or
// tails, the coin flips in 3D, and the toss winner chooses bat or bowl. The
// result is persisted with matches.setToss so the public match center shows
// "X won the toss and chose to bat/bowl".

import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { motion } from "framer-motion";
import { Coins, RotateCw, Trophy } from "lucide-react";
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
      {/* chakra ring + spokes */}
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
function RupeeCoin({ side, size = 132 }: { side: Side; size?: number }) {
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
// Toss ceremony flow: caller → call → flipping → result (bat / bowl)
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
  const [step, setStep] = useState<"caller" | "call" | "flipping" | "result">("caller");
  const [callerId, setCallerId] = useState<string>("");
  const [callSide, setCallSide] = useState<Side>("heads");
  const [result, setResult] = useState<Side | null>(null);
  const [saving, setSaving] = useState(false);

  const caller = callerId === teamA._id ? teamA : callerId === teamB._id ? teamB : null;
  const other = caller ? (caller._id === teamA._id ? teamB : teamA) : null;
  const winner = result && caller ? (callSide === result ? caller : other!) : null;

  const startFlip = () => {
    if (!caller) return;
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
      // ceremony for the "start innings" panel, pre-filled with the batting side.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the toss.");
      setSaving(false);
    }
  };

  return (
    <div className="border-2 border-[#facc15] bg-card p-4 panel-glow">
      <div className="flex items-center gap-2">
        <Coins className="size-4 text-[#facc15]" />
        <MicroLabel className="text-[#facc15]">Toss time</MicroLabel>
      </div>

      {/* ---- step 1: who calls the toss? ----------------------------------- */}
      {step === "caller" && (
        <>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            One captain calls heads or tails in the air. The winner of the toss
            decides who bats first.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[teamA, teamB].map((t) => (
              <button
                key={t._id}
                type="button"
                onClick={() => {
                  setCallerId(t._id);
                  setStep("call");
                }}
                className="border px-3 py-4 text-center transition-colors border-border bg-card text-slate-300 hover:border-[#facc15] hover:text-[#facc15]"
              >
                <span
                  className="mx-auto mb-2 flex size-10 items-center justify-center text-sm font-black text-white"
                  style={{ backgroundColor: t.color }}
                >
                  {t.shortCode}
                </span>
                <span className="block truncate text-xs font-extrabold uppercase tracking-wide">
                  {t.name}
                </span>
                <span className="mt-1 block text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  calls the toss
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---- step 2: heads or tails? --------------------------------------- */}
      {step === "call" && caller && (
        <>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            <span className="font-extrabold uppercase tracking-wide text-[#facc15]">
              {caller.name}
            </span>{" "}
            — call it in the air.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["heads", "tails"] as Side[]).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setCallSide(side)}
                className={cn(
                  "border px-2 py-3 text-center transition-colors",
                  callSide === side
                    ? "border-[#facc15] bg-[#422006]/40"
                    : "border-border bg-card hover:border-[#facc15]/50",
                )}
              >
                <div className="mx-auto w-16">
                  <RupeeCoin side={side} size={64} />
                </div>
                <span
                  className={cn(
                    "mt-2 block text-[10px] font-extrabold uppercase tracking-widest",
                    callSide === side ? "text-[#facc15]" : "text-slate-400",
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
            className="mt-3 w-full rounded-none bg-[#facc15] text-[10px] font-black uppercase tracking-widest text-[#422006] hover:bg-[#22c55e] hover:text-[#052e16]"
          >
            <Coins className="size-3.5" /> Flip the ₹10 coin
          </Button>
          <button
            type="button"
            onClick={() => setStep("caller")}
            className="mt-2 flex w-full items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-[#facc15]"
          >
            <RotateCw className="size-3" /> Choose the other team
          </button>
        </>
      )}

      {/* ---- step 3: flipping ---------------------------------------------- */}
      {step === "flipping" && caller && result && (
        <div className="mt-4 flex flex-col items-center gap-4 py-2 text-center">
          <Coin3D result={result} spinning />
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              {caller.name} called {callSide === "heads" ? "heads" : "tails"}…
            </p>
            <p className="mt-1 animate-pulse text-[10px] font-black uppercase tracking-[0.3em] text-[#facc15]">
              Tossing the coin
            </p>
          </div>
        </div>
      )}

      {/* ---- step 4: result + decision ------------------------------------- */}
      {step === "result" && caller && winner && result && (
        <>
          <div className="mt-4 flex flex-col items-center gap-4 py-1 text-center">
            <Coin3D result={result} spinning={false} />
            <div>
              <p className="micro-label text-[#facc15]">
                It's {result === "heads" ? "HEADS" : "TAILS"}!
              </p>
              {winner._id === caller._id ? (
                <p className="mt-1 text-sm font-extrabold uppercase tracking-tight text-white">
                  {winner.name} called it right — they win the toss!
                </p>
              ) : (
                <p className="mt-1 text-sm font-extrabold uppercase tracking-tight text-white">
                  {caller.name} called {callSide === "heads" ? "heads" : "tails"} but
                  the coin had other plans — {winner.name} wins the toss!
                </p>
              )}
              <p className="mt-1 flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <Trophy className="size-3 text-[#facc15]" /> Winner's call — bat or bowl
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
              🏏 Bat first
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void chooseDecision("bowl")}
              className="rounded-none bg-[#22d3ee] py-4 text-[10px] font-black uppercase tracking-widest text-[#083344] hover:bg-[#facc15] hover:text-[#422006]"
            >
              ⚾ Bowl first
            </Button>
          </div>
          <p className="mt-2 text-center text-[9px] font-bold uppercase tracking-widest text-slate-500">
            {saving ? "Locking in the toss…" : `${winner.name} decides · the other side takes the field`}
          </p>
          {!saving && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setStep("call");
              }}
              className="mt-2 flex w-full items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-[#22d3ee]"
            >
              <RotateCw className="size-3" /> Flip again
            </button>
          )}
        </>
      )}
    </div>
  );
}
