import { useCallback, useEffect, useRef, useState } from "react";
import type { Doc, Id } from "@/convex/_generated/dataModel";

export type ScorePopupKind =
  | "four"
  | "six"
  | "wicket"
  | "new_batter"
  | "bowler"
  | "milestone"
  | "team_milestone"
  | "innings"
  | "result"
  | "superover";

export interface PopupPlayer {
  name: string;
  role?: string;
  battingStyle?: string;
  bowlingStyle?: string;
  jerseyNumber?: number;
  teamColor?: string;
}

export interface ScorePopup {
  id: number;
  kind: ScorePopupKind;
  title: string;
  message: string;
  player?: PopupPlayer;
}

type PlayerDoc = Doc<"players">;
type EventRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  overLabel?: string;
};

const POPUP_MS = 3000;

/** Short human label for a batting style, e.g. "RHB" / "LHB". */
export function battingLabel(style?: string): string | null {
  if (!style) return null;
  const s = style.toLowerCase();
  if (s.includes("right") || s.includes("rhb")) return "RHB";
  if (s.includes("left") || s.includes("lhb")) return "LHB";
  return style;
}

/** Short human label for a bowling style, e.g. "Leg spinner" / "Medium pace". */
export function bowlingLabel(style?: string): string | null {
  if (!style) return null;
  const s = style.toLowerCase();
  if (s.includes("spin")) {
    if (s.includes("leg")) return "Leg spinner";
    if (s.includes("off")) return "Off spinner";
    return "Spinner";
  }
  if (s.includes("fast") || s.includes("medium")) {
    return s.includes("medium") ? "Medium pace" : "Fast bowler";
  }
  return style;
}

function toPlayer(p: PlayerDoc | undefined, teamColor?: string): PopupPlayer | undefined {
  if (!p) return undefined;
  return {
    name: p.name,
    role: p.role,
    battingStyle: p.battingStyle,
    bowlingStyle: p.bowlingStyle,
    jerseyNumber: p.jerseyNumber,
    teamColor,
  };
}

/**
 * Watches the scorecard + match events and raises short-lived flash popups so
 * the scorer SEES every key moment as it is recorded: fours, sixes, wickets,
 * the new batter walking in (with their profile), the bowler in action, batter
 * & team milestones, innings breaks and the final result.
 */
export function useScorePopups(
  scorecard:
    | {
        currentInnings: {
          id: string;
          bowler: { _id: string } | null;
          commentary: {
            key: string;
            symbol: string;
            kind: string;
            text: string;
            isWicket: boolean;
            batsmanId: string;
            batsmanName: string;
            newBatsmanId?: string;
          }[];
        } | null;
      }
    | undefined
    | null,
  battingSquad: PlayerDoc[],
  bowlingSquad: PlayerDoc[],
  events: EventRow[],
) {
  const [popups, setPopups] = useState<ScorePopup[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const seenEvents = useRef<Set<string> | null>(null);
  const seenBalls = useRef<Set<string> | null>(null);
  const lastBowlerKey = useRef<string | null>(null);

  useEffect(
    () => () => {
      for (const t of timers.current.values()) clearTimeout(t);
    },
    [],
  );

  const push = useCallback((p: Omit<ScorePopup, "id">) => {
    const id = ++idRef.current;
    setPopups((prev) => [...prev.slice(-2), { ...p, id }]);
    const timer = setTimeout(() => {
      setPopups((prev) => prev.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, POPUP_MS);
    timers.current.set(id, timer);
  }, []);

  // ---- backend events: wicket / milestones / team milestones / innings / result
  useEffect(() => {
    if (!events) return;
    if (seenEvents.current === null) {
      // Wait for the query to hydrate — seeding with an empty list would let
      // every pre-existing event replay as a popup when the page is revisited.
      if (events.length === 0) return;
      seenEvents.current = new Set(events.map((e) => e.id));
      return;
    }
    const allSquad = [...battingSquad, ...bowlingSquad];
    for (const e of events) {
      if (seenEvents.current.has(e.id)) continue;
      seenEvents.current.add(e.id);
      let kind: ScorePopupKind | null = null;
      switch (e.type) {
        case "wicket": kind = "wicket"; break;
        case "milestone": kind = "milestone"; break;
        case "team_milestone": kind = "team_milestone"; break;
        case "innings": kind = "innings"; break;
        case "result": kind = "result"; break;
        case "superover":
        case "tie": kind = "superover"; break;
        default: kind = null;
      }
      if (!kind) continue;
      // attach the player's profile when their name appears in the message
      const matched = allSquad.find(
        (p) => e.message.includes(p.name) && p.name.length > 2,
      );
      push({
        kind,
        title: e.title,
        message: e.overLabel ? `${e.overLabel} · ${e.message}` : e.message,
        player: toPlayer(matched),
      });
    }
  }, [events, battingSquad, bowlingSquad, push]);

  // ---- ball watcher: fours, sixes + the new batter after a wicket
  useEffect(() => {
    const inn = scorecard?.currentInnings;
    const balls = inn?.commentary ?? [];
    const latest = balls[0];
    if (!latest) return;
    if (seenBalls.current === null) {
      // Same hydration guard as events: only seed once real balls exist so
      // existing deliveries don't fire as popups on remount.
      if (balls.length === 0) return;
      seenBalls.current = new Set(balls.map((b) => b.key));
      return;
    }
    if (seenBalls.current.has(latest.key)) return;
    seenBalls.current.add(latest.key);

    if (latest.kind === "boundary") {
      const batter = battingSquad.find((p) => p._id === (latest.batsmanId as Id<"players">));
      if (latest.symbol.includes("6")) {
        push({
          kind: "six",
          title: "SIX!",
          message: `${latest.batsmanName} launches it — ${latest.text}`,
          player: toPlayer(batter),
        });
      } else if (latest.symbol.includes("4")) {
        push({
          kind: "four",
          title: "FOUR!",
          message: `${latest.batsmanName} — ${latest.text}`,
          player: toPlayer(batter),
        });
      }
    }

    if (latest.isWicket && latest.newBatsmanId) {
      const next = battingSquad.find(
        (p) => p._id === (latest.newBatsmanId as Id<"players">),
      );
      push({
        kind: "new_batter",
        title: "NEW BATTER IN",
        message: `${next?.name ?? "?"} walks out to the middle`,
        player: toPlayer(next),
      });
    }
  }, [scorecard, battingSquad, push]);

  // ---- bowler watcher: every change of bowler (new over / new innings)
  useEffect(() => {
    const bowlerId = scorecard?.currentInnings?.bowler?._id;
    const innId = scorecard?.currentInnings?.id;
    if (!bowlerId || !innId) return;
    const key = `${innId}:${bowlerId}`;
    if (lastBowlerKey.current === null) {
      lastBowlerKey.current = key;
      return;
    }
    if (lastBowlerKey.current !== key) {
      lastBowlerKey.current = key;
      const p = bowlingSquad.find((x) => x._id === (bowlerId as Id<"players">));
      push({
        kind: "bowler",
        title: "BOWLER IN ACTION",
        message: `${p?.name ?? "?"} takes the ball — new over`,
        player: toPlayer(p),
      });
    }
  }, [scorecard, bowlingSquad, push]);

  return popups;
}
