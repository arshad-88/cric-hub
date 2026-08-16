import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  battingLabel,
  bowlingLabel,
  type PopupPlayer,
  type ScorePopup,
  type ScorePopupKind,
} from "@/hooks/use-score-popups";

/** Live event popups — shared by the scorer (confirms every entry) and the
 *  public match center (viewers see fours, sixes, wickets, new batters,
 *  bowler changes and milestones as they happen). Fixed, click-through
 *  overlay centred on the screen; every card collapses on its own after ~3s. */

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

export function ScorePopupStage({ popups }: { popups: ScorePopup[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex flex-col items-center justify-center gap-2 px-4">
      <AnimatePresence>
        {popups.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: -14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 0, scale: 0.96 }}
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
              {battingLabel(popup.player.battingStyle) && (
                <ProfileChip label={battingLabel(popup.player.battingStyle)!} />
              )}
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
