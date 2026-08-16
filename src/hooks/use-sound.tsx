// ---------------------------------------------------------------------------
// use-sound.ts — match audio. All crowd cheers / SOLD / UNSOLD effects were
// removed on request; the ONLY sound left is the IPL-style two-tone no-ball
// siren, which plays for:
//
//   • NO BALL   — a delivery recorded as a no-ball (symbol starts with "Nb")
//   • FREE HIT  — the legal ball immediately after a no-ball
//
// The AudioContext is primed on the first user gesture (click/tap/keypress)
// because browsers suspend audio until the page has been interacted with —
// without that, the siren would silently never play. A single engine instance
// plays one siren at a time so rapid events never overlap: each new siren
// cuts the last. Mute state persists in localStorage.
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
    // Chrome/Safari keep the context suspended until a user gesture; the
    // gesture listener below calls resume() inside a click, which is allowed.
    if (audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

let primed = false;

/** Unlock audio inside the first user gesture (autoplay policy workaround). */
function primeOnGesture(): void {
  if (primed) return;
  primed = true;
  const unlock = () => {
    // Creating/resuming inside a gesture marks the context as allowed.
    const a = audio();
    if (a && a.state === "suspended") {
      void a.resume().catch(() => {});
    }
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
}

if (typeof window !== "undefined") primeOnGesture();

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

/**
 * The real IPL no-ball siren is a two-tone wail — two notes a fifth apart
 * alternating with a hard attack (like an air-horn siren). We layer the two
 * alternating square tones over a sine sub-octave for body and the noise bed
 * for air, so it reads as a stadium horn rather than a phone ringtone.
 */
function siren(ctx: AudioContext, dur: number, peak: number): void {
  if (!master) return;
  const t0 = ctx.currentTime;
  noiseBed(ctx, master, t0, dur, peak * 0.25, 900, "bandpass");
  const hi = 830; // ~G#5
  const lo = 622; // ~D#5 (fifth below — the classic siren interval)
  const toneDur = 0.42;
  const cycles = Math.max(3, Math.floor(dur / toneDur));
  for (let i = 0; i < cycles; i++) {
    const t = t0 + i * toneDur;
    const isHi = i % 2 === 0;
    const f = isHi ? hi : lo;
    tone(ctx, master, t, f, toneDur * 0.92, peak * (isHi ? 0.8 : 0.68));
    // Sub-octave sine gives the horn its chest; same note, one octave down.
    tone(ctx, master, t, f / 2, toneDur * 0.92, peak * 0.3, "sine");
  }
}

/** Play the no-ball siren. A new call cuts any siren still playing. */
export function playNoBallSiren(enabled = true): void {
  if (!enabled) return;
  const a = audio();
  if (!a || !master) return;
  cutPrevious();
  siren(a, 2.1, 0.95);
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
      // Unlocking inside the click handler also satisfies autoplay policy.
      if (nv) audio();
      return nv;
    });
  }, []);
  return { enabled, toggle };
}

/** No-ball balls are symboled "Nb…" by the scoring engine. */
function isNoBallSymbol(symbol: string): boolean {
  return symbol.toUpperCase().startsWith("NB");
}

const MAX_WATCHED = 3;

/**
 * Watches ONE live match's newest deliveries and fires the siren on NO BALL
 * / FREE HIT. Owns its own last-ball ref so revisiting a page never replays
 * the whole match's history.
 */
function MatchSoundWatch({
  matchId,
  enabled,
}: {
  matchId: Id<"matches"> | undefined;
  enabled: boolean;
}): null {
  const scorecard = useQuery(
    api.scorecard.get,
    matchId ? { matchId } : "skip",
  );
  const lastBall = useRef<string | null>(null);
  useEffect(() => {
    const balls = scorecard?.currentInnings?.commentary ?? [];
    const newest = balls[0];
    if (!newest) return;
    if (lastBall.current === null) {
      // First observation — seed without playing.
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

/**
 * App-wide siren watcher: plays the no-ball siren for NO BALL and FREE HIT
 * balls from every live match's newest deliveries. Mounted once at the root —
 * always returns null (renders nothing).
 */
export function SoundEngine() {
  const { enabled } = useSoundEnabled();
  const liveMatches = useQuery(api.matches.list, { status: "LIVE" });
  const live = (liveMatches ?? []).slice(0, MAX_WATCHED);

  return (
    <>
      {live.map((m) => (
        <MatchSoundWatch
          key={m.id}
          matchId={m.id as Id<"matches">}
          enabled={enabled}
        />
      ))}
    </>
  );
}
