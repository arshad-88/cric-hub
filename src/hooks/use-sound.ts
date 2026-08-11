// ---------------------------------------------------------------------------
// use-sound.ts — synthesized match/auction sound effects (Web Audio, no audio
// files needed). A single engine instance plays one sound at a time so rapid
// events (a six off a no-ball) never overlap: each new sound cuts the last.
// Mute state persists in localStorage and is toggled from the header.
// ---------------------------------------------------------------------------

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

export type SoundKind =
  | "four"
  | "six"
  | "wicket"
  | "fifty"
  | "century"
  | "milestone"
  | "hatTrickBall"
  | "hatTrick"
  | "victory"
  | "sold"
  | "unsold"
  | "appeal"
  | "wide"
  | "noball";

const TONES: Record<SoundKind, number[]> = {
  four: [523.25, 659.25, 783.99],
  six: [392, 523.25, 659.25, 783.99, 1046.5],
  wicket: [311, 233, 155.56],
  fifty: [523.25, 659.25, 783.99, 1046.5],
  century: [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5],
  milestone: [523.25, 659.25, 783.99],
  hatTrickBall: [440, 493.88, 523.25],
  hatTrick: [392, 493.88, 587.33, 783.99, 987.77],
  victory: [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5],
  sold: [880, 1318.5],
  unsold: [329.63, 220],
  appeal: [698.46, 698.46],
  wide: [587.33],
  noball: [493.88],
};

let audioCtx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

const active: AudioScheduledSourceNode[] = [];

/** Play one synthesized effect. A new call cuts any sound still playing. */
export function playSound(kind: SoundKind, enabled = true): void {
  if (!enabled) return;
  const a = audio();
  if (!a) return;
  for (const n of active) {
    try {
      n.stop();
    } catch {
      // already stopped
    }
  }
  active.length = 0;
  const freqs = TONES[kind] ?? TONES.milestone;
  const now = a.currentTime;
  freqs.forEach((f, i) => {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = i < 2 ? "triangle" : "sine";
    osc.frequency.value = f;
    const t0 = now + i * 0.09;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38);
    osc.connect(gain);
    gain.connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + 0.42);
    active.push(osc);
  });
}

const STORAGE_KEY = "crikhub.sound.enabled";

/** Global sound on/off, persisted across reloads. */
export function useSoundEnabled(): { enabled: boolean; toggle: () => void } {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const toggle = useCallback(() => {
    setEnabled((v) => {
      const nv = !v;
      try {
        localStorage.setItem(STORAGE_KEY, nv ? "on" : "off");
      } catch {
        // storage unavailable — keep in-memory state
      }
      return nv;
    });
  }, []);
  return { enabled, toggle };
}

/** Map a notification title to the right effect. */
export function soundForEventTitle(title: string): SoundKind | null {
  const t = title.toUpperCase();
  if (t.includes("HAT-TRICK BALL")) return "hatTrickBall";
  if (t.includes("HAT-TRICK")) return "hatTrick";
  if (t.includes("WICKET")) return "wicket";
  if (t.includes("CENTURY")) return "century";
  if (t.includes("FIFTY")) return "fifty";
  if (t.includes("FULL TIME") || t.includes("RESULT")) return "victory";
  if (t.includes("TIED") || t.includes("SUPER OVER")) return "hatTrickBall";
  if (
    t.includes("PARTNERSHIP") ||
    t.includes("HAUL") ||
    t.includes("UP") ||
    t.includes("MATCH LIVE")
  ) {
    return "milestone";
  }
  return null;
}

/**
 * App-wide sound watcher: plays effects for new key match events (wickets,
 * milestones, results) and for fours/sixes detected from the live scorecard.
 * Mounted once at the root — always returns null (renders nothing).
 */
export function SoundEngine(): null {
  const { enabled } = useSoundEnabled();
  const events = useQuery(api.notifications.listRecent, { limit: 20 });
  const seen = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (events === undefined) return;
    if (!initialized.current) {
      initialized.current = true;
      for (const e of events) seen.current.add(e.id);
      return;
    }
    for (const e of events) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      const kind = soundForEventTitle(e.title);
      if (kind) playSound(kind, enabled);
    }
  }, [events, enabled]);

  // fours / sixes from the live match's newest ball
  const liveMatches = useQuery(api.matches.list, { status: "LIVE" });
  const scorecard = useQuery(
    api.scorecard.get,
    liveMatches?.[0]
      ? { matchId: liveMatches[0].id as Id<"matches"> }
      : "skip",
  );
  const lastBall = useRef<string | null>(null);
  useEffect(() => {
    const balls = scorecard?.currentInnings?.commentary ?? [];
    const newest = balls[0];
    if (!newest) return;
    if (lastBall.current === null) {
      lastBall.current = newest.key;
      return;
    }
    if (lastBall.current === newest.key) return;
    lastBall.current = newest.key;
    if (!enabled) return;
    if (newest.symbol === "6") playSound("six");
    else if (newest.symbol === "4") playSound("four");
  }, [scorecard, enabled]);

  return null;
}
