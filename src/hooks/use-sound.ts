// ---------------------------------------------------------------------------
// use-sound.ts — match/auction sound effects, synthesized in-browser with Web
// Audio (no audio files, so it always loads and never blocks). The effects are
// built from layered noise + tone beds to sound like a real broadcast:
//
//   • six / four / fifty / century / hat-trick / five-wicket / victory → big
//     audience cheers (roar + claps + whistles + air horns)
//   • noball → the classic two-tone no-ball siren with a crowd murmur
//   • wicket → the crack of the stumps + a collective groan
//
// A single engine instance plays one effect at a time so rapid events never
// overlap: each new sound cuts the last. Mute state persists in localStorage.
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
  | "fiveWicket"
  | "hatTrickBall"
  | "hatTrick"
  | "victory"
  | "sold"
  | "unsold"
  | "appeal"
  | "wide"
  | "noball";

// ---- shared audio plumbing -------------------------------------------------

let audioCtx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      // Master bus: one compressor keeps every effect loud but clean.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 20;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      comp.connect(ctx.destination);
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp);
      // Shared white-noise buffer for crowd/clap beds.
      const len = Math.floor(ctx.sampleRate * 2);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      audioCtx = ctx;
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

const active: AudioScheduledSourceNode[] = [];

function cutPrevious(): void {
  for (const n of active) {
    try {
      n.stop();
    } catch {
      // already stopped
    }
  }
  active.length = 0;
}

function track(node: AudioScheduledSourceNode): void {
  active.push(node);
  node.onended = () => {
    const i = active.indexOf(node);
    if (i >= 0) active.splice(i, 1);
  };
}

function gainEnv(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  peak: number,
  dur: number,
  attack = 0.02,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(dest);
  return g;
}

/** One-shot bandpass noise burst (claps, thuds, roars). */
function noiseHit(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  dur: number,
  peak: number,
  freq: number,
  q = 1.2,
): void {
  if (!noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = gainEnv(ctx, dest, t0, peak, dur);
  src.connect(bp);
  bp.connect(g);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
  track(src);
}

/** Continuous noise bed with a swell envelope (crowd roar / murmur). */
function noiseBed(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  dur: number,
  peak: number,
  freq: number,
  type: BiquadFilterType = "lowpass",
): void {
  if (!noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = gainEnv(ctx, dest, t0, peak, dur, 0.12);
  src.connect(f);
  f.connect(g);
  src.start(t0);
  src.stop(t0 + dur + 0.1);
  track(src);
}

/** A single pitched tone with envelope (horns, sirens, whistles). */
function tone(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  freq: number,
  dur: number,
  peak: number,
  type: OscillatorType = "sawtooth",
  glideTo?: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, glideTo),
      t0 + dur,
    );
  }
  const g = gainEnv(ctx, dest, t0, peak, dur);
  osc.connect(g);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  track(osc);
}

/** Formant-style "woo" / "ooh" swell (bandpassed saw through a falling glide). */
function wooSwell(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  dur: number,
  peak: number,
  fromFreq = 900,
  toFreq = 450,
): void {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(fromFreq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, toFreq), t0 + dur);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 700;
  bp.Q.value = 3.5;
  const g = gainEnv(ctx, dest, t0, peak, dur, 0.15);
  osc.connect(bp);
  bp.connect(g);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  track(osc);
}

/** Random applause: many short bandpass ticks over a window. */
function claps(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  dur: number,
  count: number,
  peak: number,
): void {
  for (let i = 0; i < count; i++) {
    const t = t0 + Math.random() * dur;
    noiseHit(ctx, dest, t, 0.035, peak * (0.5 + Math.random() * 0.7), 1400 + Math.random() * 1800, 2.2);
  }
}

/** Sharp whistle mixed into big cheers. */
function whistles(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  dur: number,
  peak: number,
): void {
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const t = t0 + Math.random() * dur;
    const f = 2400 + Math.random() * 1600;
    tone(ctx, dest, t, f, 0.22, peak, "sine", f * 1.25);
  }
}

/** Big broadcast-style audience cheer. */
function cheer(
  ctx: AudioContext,
  dur: number,
  peak: number,
  opts: { horn?: boolean; huge?: boolean } = {},
): void {
  if (!master) return;
  const t0 = ctx.currentTime;
  // 1) the roar: low crowd bed that swells in
  noiseBed(ctx, master, t0, dur, peak * 0.85, opts.huge ? 1100 : 900);
  // 2) rising "ooooh" before the explosion (for huge moments)
  if (opts.huge) wooSwell(ctx, master, t0, dur * 0.35, peak * 0.5, 850, 420);
  // 3) applause wall
  claps(ctx, master, t0, dur, opts.huge ? 90 : 46, peak * 0.55);
  // 4) whistles
  whistles(ctx, master, t0, dur, peak * 0.35);
  // 5) air horns on the big moments
  if (opts.horn) {
    tone(ctx, master, t0 + dur * 0.08, 520, 0.5, peak * 0.55, "sawtooth", 400);
    tone(ctx, master, t0 + dur * 0.08, 660, 0.5, peak * 0.45, "sawtooth", 520);
  }
  if (opts.huge) {
    tone(ctx, master, t0 + dur * 0.45, 520, 0.6, peak * 0.5, "sawtooth", 400);
  }
}

/** Crowd "aww" / groan after a wicket or unsold. */
function groan(ctx: AudioContext, dur: number, peak: number): void {
  if (!master) return;
  const t0 = ctx.currentTime;
  noiseBed(ctx, master, t0, dur, peak * 0.5, 500);
  wooSwell(ctx, master, t0, dur, peak * 0.4, 420, 160);
  claps(ctx, master, t0, dur * 0.5, 8, peak * 0.12);
}

/** IPL-style two-tone no-ball siren with a murmur bed. */
function siren(ctx: AudioContext, dur: number, peak: number): void {
  if (!master) return;
  const t0 = ctx.currentTime;
  noiseBed(ctx, master, t0, dur, peak * 0.3, 700, "bandpass");
  const cycles = Math.max(2, Math.floor(dur / 0.42));
  for (let i = 0; i < cycles; i++) {
    const t = t0 + i * 0.42;
    const hi = i % 2 === 0;
    tone(ctx, master, t, hi ? 880 : 659, 0.38, peak * (hi ? 0.85 : 0.7), "square");
  }
}

/** Play one synthesized effect. A new call cuts any sound still playing. */
export function playSound(kind: SoundKind, enabled = true): void {
  if (!enabled) return;
  const a = audio();
  if (!a || !master) return;
  cutPrevious();
  const now = a.currentTime;
  switch (kind) {
    case "six":
      cheer(a, 2.2, 0.95, { huge: true, horn: true });
      break;
    case "four":
      cheer(a, 1.5, 0.85, {});
      break;
    case "wicket":
      // crack of the stumps, then the groan
      noiseHit(a, master, now, 0.09, 0.9, 260, 1.5);
      noiseHit(a, master, now + 0.03, 0.16, 0.7, 1200, 0.8);
      groan(a, 1.6, 0.7);
      break;
    case "fifty":
      cheer(a, 2.4, 0.95, { huge: true, horn: true });
      break;
    case "century":
      cheer(a, 3.2, 1.0, { huge: true, horn: true });
      tone(a, master, now + 0.1, 784, 0.5, 0.5, "triangle");
      tone(a, master, now + 0.22, 988, 0.5, 0.5, "triangle");
      break;
    case "fiveWicket":
      cheer(a, 3.4, 1.0, { huge: true, horn: true });
      break;
    case "hatTrick":
      cheer(a, 3.4, 1.0, { huge: true, horn: true });
      for (let i = 0; i < 3; i++) {
        tone(a, master, now + 0.15 + i * 0.18, 440, 0.4, 0.5, "square");
      }
      break;
    case "hatTrickBall":
      // tense rising "oooooh" — everyone holding their breath
      wooSwell(a, master, now, 1.6, 0.75, 500, 1200);
      noiseBed(a, master, now, 1.6, 0.25, 800, "bandpass");
      break;
    case "victory":
      cheer(a, 3.6, 1.0, { huge: true, horn: true });
      break;
    case "milestone":
      cheer(a, 1.8, 0.85, { horn: true });
      break;
    case "noball":
      siren(a, 2.0, 0.95);
      noiseBed(a, master, now + 0.15, 1.4, 0.2, 900, "bandpass");
      break;
    case "wide":
      siren(a, 0.8, 0.5);
      break;
    case "sold":
      cheer(a, 1.6, 0.9, {});
      tone(a, master, now + 0.1, 1046, 0.45, 0.4, "triangle");
      tone(a, master, now + 0.22, 1318, 0.5, 0.4, "triangle");
      break;
    case "unsold":
      groan(a, 1.5, 0.65);
      break;
    case "appeal":
      wooSwell(a, master, now, 1.3, 0.7, 600, 1400);
      noiseBed(a, master, now, 1.3, 0.3, 1000, "bandpass");
      break;
  }
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
  if (t.includes("5-WICKET HAUL")) return "fiveWicket";
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
