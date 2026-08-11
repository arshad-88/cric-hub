// ---------------------------------------------------------------------------
// use-sound.ts — match audio. All crowd cheers / SOLD / UNSOLD effects were
// removed on request; the ONLY sound left is the IPL-style two-tone no-ball
// siren, which plays for:
//
//   • NO BALL   — a delivery recorded as a no-ball (symbol starts with "Nb")
//   • FREE HIT  — the legal ball immediately after a no-ball
//
// A single engine instance plays one siren at a time so rapid events never
// overlap: each new siren cuts the last. Mute state persists in localStorage.
// ---------------------------------------------------------------------------

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

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
      // Master bus: one compressor keeps the siren loud but clean.
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
      // Shared white-noise buffer for the crowd-murmur bed under the siren.
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

/** Continuous noise bed with a swell envelope (crowd murmur under the siren). */
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

/** A single pitched tone with envelope (the siren's two alternating notes). */
function tone(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  freq: number,
  dur: number,
  peak: number,
  type: OscillatorType = "square",
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  const g = gainEnv(ctx, dest, t0, peak, dur);
  osc.connect(g);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  track(osc);
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
    tone(ctx, master, t, hi ? 880 : 659, 0.38, peak * (hi ? 0.85 : 0.7));
  }
}

/** Play the no-ball siren. A new call cuts any siren still playing. */
export function playNoBallSiren(enabled = true): void {
  if (!enabled) return;
  const a = audio();
  if (!a || !master) return;
  cutPrevious();
  siren(a, 2.0, 0.95);
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

/** No-ball balls are symboled "Nb…" by the scoring engine. */
function isNoBallSymbol(symbol: string): boolean {
  return symbol.toUpperCase().startsWith("NB");
}

/**
 * App-wide siren watcher: plays the no-ball siren for NO BALL and FREE HIT
 * balls from the live match's newest deliveries. Mounted once at the root —
 * always returns null (renders nothing).
 */
export function SoundEngine(): null {
  const { enabled } = useSoundEnabled();

  // new ball events (wickets / milestones) never trigger a sound any more —
  // only the no-ball siren below.
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
    // NO BALL — the newest delivery itself is a no-ball.
    if (isNoBallSymbol(newest.symbol)) {
      playNoBallSiren(true);
      return;
    }
    // FREE HIT — the previous delivery was a no-ball, so this one is the
    // free hit that follows it.
    const previous = balls[1];
    if (previous && isNoBallSymbol(previous.symbol)) {
      playNoBallSiren(true);
    }
  }, [scorecard, enabled]);

  return null;
}
