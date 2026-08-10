import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { BallChip, MicroLabel } from "@/components/swiss";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Copy,
  Crown,
  Gavel,
  Loader2,
  PartyPopper,
  Plus,
  Trophy,
  Users,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

// ---- money -----------------------------------------------------------------

export function inr(lakhs: number): string {
  if (lakhs >= 100) {
    const cr = lakhs / 100;
    return `₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(1)} Cr`;
  }
  return `₹${lakhs} L`;
}

// ---- photo (Wikipedia REST, cached, with initials fallback) ----------------

const wikiCache = new Map<string, string>();

async function wikiThumb(title: string): Promise<string | null> {
  if (wikiCache.has(title)) return wikiCache.get(title) || null;
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    );
    if (!res.ok) {
      wikiCache.set(title, "");
      return null;
    }
    const data = await res.json();
    const src = data?.thumbnail?.source ?? "";
    wikiCache.set(title, src);
    return src || null;
  } catch {
    wikiCache.set(title, "");
    return null;
  }
}

function PlayerPhoto({
  name,
  wiki,
  photoUrl,
  className,
  textClass,
}: {
  name: string;
  wiki?: string;
  photoUrl?: string;
  className?: string;
  textClass?: string;
}) {
  const [src, setSrc] = useState<string | null>(photoUrl ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!src && wiki && !failed) {
      wikiThumb(wiki).then((s) => {
        if (alive && s) setSrc(s);
      });
    }
    return () => {
      alive = false;
    };
  }, [wiki, src, failed]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("object-cover", className)}
      />
    );
  }
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-gradient-to-br from-[#22c55e] to-[#0b1524] font-black",
        className,
      )}
    >
      <span className={cn("text-[#052e16]", textClass)}>{initials || "?"}</span>
    </div>
  );
}

// ---- squad rating ----------------------------------------------------------

interface Stat {
  matches: number;
  runs: number;
  wickets: number;
  sr: number;
  econ: number;
}
interface SoldPlayer {
  playerKey: string;
  name: string;
  role: string;
  price: number;
  photoUrl?: string;
  wiki?: string;
  teamShort?: string;
  career?: Stat;
  form?: Stat;
}

function playerRating(p: SoldPlayer): number {
  const c = p.career;
  const f = p.form;
  const batC = c ? Math.min(35, (c.runs / 500) * 1.75 + (c.sr / 135) * 7) : 0;
  const bowlC = c ? Math.min(35, c.wickets * 0.35 + Math.max(0, 7.5 - c.econ) * 6) : 0;
  const batF = f ? Math.min(25, (f.runs / 100) * 1.5 + (f.sr / 140) * 6) : 0;
  const bowlF = f ? Math.min(25, f.wickets * 1.5 + Math.max(0, 7.5 - f.econ) * 5) : 0;
  switch (p.role) {
    case "Bowler":
      return Math.min(100, Math.round(bowlC * 0.85 + bowlF));
    case "Wicketkeeper":
      return Math.min(100, Math.round(batC * 0.6 + batF + 6));
    case "All-rounder":
      return Math.min(100, Math.round(batC * 0.55 + bowlC * 0.55 + batF * 0.7 + bowlF * 0.7));
    default:
      return Math.min(100, Math.round(batC * 0.85 + batF));
  }
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[9px] font-bold uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#0b1524]">
        <div
          className="h-full bg-gradient-to-r from-[#facc15] to-[#22c55e]"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

// ---- page ------------------------------------------------------------------

export default function AuctionRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const room = useQuery(
    api.auction.get,
    id ? { auctionId: id as Id<"auctions"> } : "skip",
  );

  const isHost = !!user && room?.hostId === user._id;
  const myTeam = room?.teams.find((t) => t.ownerId === user?._id) ?? null;

  if (room === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (room === null) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">
            Room not found
          </h1>
          <p className="mt-2 text-xs uppercase tracking-widest text-slate-500">
            It may have been removed — head back to the auction house.
          </p>
          <Link
            to="/auction"
            className="mt-6 inline-flex items-center gap-2 bg-[#22c55e] px-5 py-3 text-xs font-black uppercase tracking-widest text-[#052e16]"
          >
            <ArrowLeft className="size-4" /> Auction house
          </Link>
        </main>
      </div>
    );
  }

  const current =
    room.currentIndex != null ? room.pool[room.currentIndex] ?? null : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        {/* header */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/auction"
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-3.5" /> Auctions
          </Link>
          <span className="h-4 w-px bg-border" aria-hidden />
          <h1 className="text-lg font-black uppercase tracking-tight text-white">
            {room.title}
          </h1>
          <span
            className={cn(
              "px-2 py-1 text-[9px] font-black uppercase tracking-widest",
              room.mode === "ipl"
                ? "bg-[#facc15]/15 text-[#facc15]"
                : "bg-[#22c55e]/15 text-[#22c55e]",
            )}
          >
            {room.mode === "ipl" ? "Real IPL" : "Local auction"}
          </span>
          <RoomCode code={room.roomCode} />
          <span className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-1 text-[9px] font-black uppercase tracking-widest",
                room.status === "LIVE"
                  ? "bg-[#ef4444] text-white"
                  : room.status === "COMPLETED"
                    ? "bg-[#22c55e]/15 text-[#22c55e]"
                    : "bg-[#22d3ee]/15 text-[#22d3ee]",
              )}
            >
              {room.status === "LIVE" && (
                <span className="size-1.5 animate-pulse rounded-full bg-white" />
              )}
              {room.status}
            </span>
            <span className="score-nums hidden text-[10px] font-bold text-slate-500 sm:inline">
              {room.soldCount}/{room.pool.length} players done
            </span>
          </span>
        </div>

        {/* teams strip */}
        <div className="mt-5 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
          {room.teams.map((t) => (
            <div
              key={String(t._id)}
              className={cn(
                "bg-card px-3 py-3",
                myTeam?._id === t._id && "ring-1 ring-inset ring-[#22c55e]",
              )}
            >
              <p className="flex items-center gap-1.5 truncate text-xs font-extrabold uppercase tracking-tight text-slate-100">
                <span
                  className="size-2 shrink-0"
                  style={{ backgroundColor: t.color }}
                />
                {t.name}
                {t._id === room.currentBidderTeamId && (
                  <span className="animate-pulse text-[#facc15]">· bidding</span>
                )}
              </p>
              <p className="score-nums mt-1 text-[10px] font-bold text-slate-500">
                {inr(t.purseRemaining)} left · {t.soldCount} signed
              </p>
            </div>
          ))}
        </div>

        {/* join CTA */}
        {!myTeam && room.status !== "COMPLETED" && (
          <JoinPanel auctionId={room._id} />
        )}

        {/* live block */}
        {room.status === "LIVE" && current ? (
          <LiveBlock room={room} current={current} isHost={isHost} />
        ) : room.status === "SETUP" || (room.status === "LIVE" && !current) ? (
          <SetupPanel room={room} isHost={isHost} />
        ) : null}

        {/* pool */}
        <PoolGrid room={room} />

        {/* results */}
        {room.status === "COMPLETED" && <Results room={room} />}
      </main>
      <SiteFooter />
    </div>
  );
}

// ---- sub-components --------------------------------------------------------

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="inline-flex items-center gap-1.5 border border-[#22d3ee]/40 bg-[#083344] px-2.5 py-1 font-mono text-sm font-black tracking-[0.25em] text-[#22d3ee] transition-colors hover:bg-[#22d3ee] hover:text-[#083344]"
      title="Copy join code"
    >
      {code}
      {copied ? <PartyPopper className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function JoinPanel({ auctionId }: { auctionId: Id<"auctions"> }) {
  const { user } = useAuth();
  const join = useMutation(api.auction.join);
  const [name, setName] = useState(user?.name ? `${user.name}'s XI` : "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await join({ auctionId, teamName: name });
      toast.success("You're in the auction — go get your players!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 flex flex-wrap items-end gap-3 border border-[#22c55e]/40 bg-[#052e16]/60 p-4">
      <div className="min-w-52 flex-1">
        <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
          Your team name
        </Label>
        <Input
          className="mt-1 h-10 rounded-none border-border bg-[#0b1524] text-xs text-slate-200"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My XI"
        />
      </div>
      <Button
        type="button"
        disabled={busy}
        onClick={submit}
        className="h-10 rounded-none bg-[#22c55e] px-4 text-[10px] font-black uppercase tracking-widest text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]"
      >
        <Plus className="size-3.5" /> Join the auction
      </Button>
    </div>
  );
}

function SetupPanel({
  room,
  isHost,
}: {
  room: RoomView;
  isHost: boolean;
}) {
  return (
    <div className="mt-6 border border-border bg-card p-8 text-center panel-glow">
      {isHost ? (
        <>
          <Gavel className="mx-auto size-8 text-[#facc15]" />
          <h2 className="mt-3 text-xl font-black uppercase tracking-tight text-white">
            Ready for the hammer
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
            {room.pool.length} players · {room.squadSize}-player squads · {inr(room.purse)}{" "}
            purse each. When your friends have joined, call the first player to
            the block.
          </p>
          <CallNextButton roomId={room._id} nextIndex={room.soldCount} />
        </>
      ) : (
        <>
          <Users className="mx-auto size-8 text-[#22d3ee]" />
          <h2 className="mt-3 text-xl font-black uppercase tracking-tight text-white">
            Waiting for the auctioneer
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
            {room.pool.length} players are in the pool. The host will call the
            first player any moment — keep this tab open.
          </p>
        </>
      )}
    </div>
  );
}

function CallNextButton({
  roomId,
  nextIndex,
  label = "Call first player",
  className,
}: {
  roomId: Id<"auctions">;
  nextIndex: number;
  label?: string;
  className?: string;
}) {
  const startPlayer = useMutation(api.auction.startPlayer);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await startPlayer({ auctionId: roomId, index: nextIndex });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not call the player.");
        } finally {
          setBusy(false);
        }
      }}
      className={cn(
        "mt-6 inline-flex items-center gap-2 rounded-none bg-[#facc15] px-6 py-3 text-xs font-black uppercase tracking-widest text-[#422006] hover:bg-[#22c55e] hover:text-[#052e16]",
        className,
      )}
    >
      <Gavel className="size-4" /> {label}
    </Button>
  );
}

type AuctionMode = "ipl" | "custom";
type AuctionStatus = "SETUP" | "LIVE" | "COMPLETED";

interface PoolPlayerView {
  key: string;
  name: string;
  role: string;
  basePrice: number;
  photoUrl?: string;
  wiki?: string;
  teamShort?: string;
  career?: Stat;
  form?: Stat;
}

interface TeamView {
  _id: Id<"auctionTeams">;
  ownerId: Id<"users">;
  name: string;
  color: string;
  ownerName: string;
  purseRemaining: number;
  soldCount: number;
  sold: SoldPlayer[];
}

interface RoomView {
  _id: Id<"auctions">;
  mode: AuctionMode;
  title: string;
  hostId: Id<"users">;
  hostName: string;
  tournamentId?: Id<"tournaments">;
  purse: number;
  squadSize: number;
  status: AuctionStatus;
  roomCode: string;
  pool: PoolPlayerView[];
  currentIndex?: number;
  currentBid?: number;
  currentBidderTeamId?: Id<"auctionTeams">;
  currentBidderName: string | null;
  bidEndsAt?: number;
  soldCount: number;
  updatedAt: number;
  teams: TeamView[];
}

function LiveBlock({
  room,
  current,
  isHost,
}: {
  room: RoomView;
  current: NonNullable<RoomView["pool"]>[number];
  isHost: boolean;
}) {
  const finishPlayer = useMutation(api.auction.finishPlayer);
  const placeBid = useMutation(api.auction.placeBid);
  const { user } = useAuth();
  const myTeam = room.teams.find((t) => t.ownerId === user?._id) ?? null;

  // timer
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);
  const now = Date.now();
  const remaining = room.bidEndsAt ? Math.max(0, room.bidEndsAt - now) : 0;
  const secs = Math.ceil(remaining / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  // auto-sell when the clock hits zero (host side)
  const autoRef = useRef(false);
  useEffect(() => {
    if (
      room.status === "LIVE" &&
      room.currentIndex != null &&
      remaining === 0 &&
      isHost &&
      !autoRef.current
    ) {
      autoRef.current = true;
      finishPlayer({
        auctionId: room._id,
        sold: !!room.currentBidderTeamId,
      }).catch(() => {});
    } else if (room.currentIndex == null) {
      autoRef.current = false;
    }
  }, [remaining, room.status, room.currentIndex, isHost, room._id, room.currentBidderTeamId, finishPlayer]);

  const myPurse = myTeam?.purseRemaining ?? 0;
  const bidChips = [
    (room.currentBid ?? 0) + 5,
    (room.currentBid ?? 0) + 10,
    (room.currentBid ?? 0) + 25,
    (room.currentBid ?? 0) + 50,
  ].filter((a) => a <= myPurse);

  const doBid = async (amount: number) => {
    try {
      await placeBid({ auctionId: room._id, amount });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bid rejected.");
    }
  };

  const doFinish = async (sold: boolean) => {
    try {
      await finishPlayer({ auctionId: room._id, sold });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not finish the player.");
    }
  };

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      {/* player card */}
      <div className="relative overflow-hidden border border-border bg-card panel-glow">
        <div className="h-1 bg-gradient-to-r from-[#facc15] via-[#22c55e] to-[#22d3ee]" aria-hidden />
        <div className="flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-stretch">
          <div className="relative shrink-0">
            <PlayerPhoto
              name={current.name}
              wiki={current.wiki}
              photoUrl={current.photoUrl}
              className="size-40 rounded-full border-4 border-[#facc15]/60 sm:size-48"
              textClass="text-5xl"
            />
            {current.teamShort && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#0b1524] px-2 py-0.5 text-[10px] font-black tracking-widest text-[#facc15] ring-1 ring-[#facc15]/40">
                {current.teamShort}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <MicroLabel className="text-[#facc15]">On the block</MicroLabel>
            <h2 className="mt-1 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
              {current.name}
            </h2>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {current.role} · base {inr(current.basePrice)}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <StatCell label="Career M" value={current.career?.matches ?? "—"} />
              <StatCell label="Form M" value={current.form?.matches ?? "—"} />
              <StatCell label="Career runs" value={current.career ? String(current.career.runs) : "—"} tone="gold" />
              <StatCell label="Form runs" value={current.form ? String(current.form.runs) : "—"} tone="gold" />
              <StatCell label="Career wkts" value={current.career ? String(current.career.wickets) : "—"} tone="cyan" />
              <StatCell label="Form wkts" value={current.form ? String(current.form.wickets) : "—"} tone="cyan" />
              <StatCell label="Career SR" value={current.career?.sr ? String(current.career.sr) : "—"} />
              <StatCell label="Form SR" value={current.form?.sr ? String(current.form.sr) : "—"} />
            </div>

            {current.career && (
              <div className="mt-4 space-y-1.5 border-t border-border pt-3">
                <StatBar label="Career" value={playerRating({ playerKey: current.key, ...current, price: current.basePrice })} />
                {current.form && <StatBar label="Form" value={playerRating({ playerKey: current.key, ...current, price: current.basePrice, career: current.form })} />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* bid console */}
      <div className="flex flex-col border border-border bg-card panel-glow">
        <div className="flex items-center justify-between border-b border-border bg-[#422006] px-4 py-3">
          <MicroLabel className="text-[#facc15]">Live bidding</MicroLabel>
          <span
            className={cn(
              "score-nums font-mono text-lg font-black tabular-nums",
              remaining <= 10000 ? "animate-pulse text-[#ef4444]" : "text-white",
            )}
          >
            {mm}:{ss}
          </span>
        </div>

        <div className="flex-1 space-y-4 p-4">
          <div className="text-center">
            <MicroLabel className="text-slate-500">Current bid</MicroLabel>
            <p className="score-nums mt-1 text-4xl font-black text-[#facc15] led-gold">
              {inr(room.currentBid ?? current.basePrice)}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {room.currentBidderName ? (
                <>
                  Highest bid: <span className="text-[#22c55e]">{room.currentBidderName}</span>
                </>
              ) : (
                "Waiting for the first bid…"
              )}
            </p>
          </div>

          {myTeam && room.status === "LIVE" ? (
            <div className="space-y-2">
              <MicroLabel className="text-slate-500">
                Your purse: <span className="text-[#22c55e]">{inr(myPurse)}</span>
              </MicroLabel>
              <div className="grid grid-cols-2 gap-2">
                {bidChips.length > 0 ? (
                  bidChips.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={a > myPurse}
                      onClick={() => doBid(a)}
                      className="border border-border bg-[#0b1524] py-3 text-xs font-black uppercase tracking-widest text-slate-200 transition-colors hover:border-[#22c55e] hover:bg-[#22c55e] hover:text-[#052e16] disabled:opacity-40"
                    >
                      Bid {inr(a)}
                    </button>
                  ))
                ) : (
                  <p className="col-span-2 border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-[#ef4444]">
                    Not enough purse to raise the bid
                  </p>
                )}
              </div>
            </div>
          ) : myTeam ? (
            <p className="border border-border bg-[#0b1524] px-3 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
              A player will be called any second…
            </p>
          ) : (
            <p className="border border-border bg-[#0b1524] px-3 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Join the room above to start bidding
            </p>
          )}

          {isHost && (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => doFinish(true)}
                  disabled={!room.currentBidderTeamId}
                  className="bg-[#22c55e] py-3 text-[10px] font-black uppercase tracking-widest text-[#052e16] transition-colors hover:bg-[#facc15] hover:text-[#422006] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  SOLD
                </button>
                <button
                  type="button"
                  onClick={() => doFinish(false)}
                  className="bg-[#ef4444] py-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-[#7f1d1d]"
                >
                  Unsold
                </button>
              </div>
              <p className="text-center text-[9px] uppercase tracking-widest text-slate-600">
                Auctioneer only — sells to the current highest bidder
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "gold" | "cyan";
}) {
  const toneCls =
    tone === "gold"
      ? "text-[#facc15]"
      : tone === "cyan"
        ? "text-[#22d3ee]"
        : "text-slate-200";
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1">
      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <span className={cn("score-nums text-sm font-extrabold", toneCls)}>{value}</span>
    </div>
  );
}

function PoolGrid({ room }: { room: RoomView }) {
  const soldMap = new Map<string, { team: string; color: string; price: number }>();
  for (const t of room.teams) {
    for (const s of t.sold) {
      soldMap.set(s.playerKey, { team: t.name, color: t.color, price: s.price });
    }
  }
  return (
    <div className="mt-8">
      <MicroLabel className="mb-3 block text-slate-500">Player pool — {room.pool.length} players</MicroLabel>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
        {room.pool.map((p, i) => {
          const sale = soldMap.get(p.key);
          const isCurrent = room.currentIndex === i;
          return (
            <div
              key={p.key}
              className={cn(
                "relative border bg-card p-2 text-center",
                isCurrent
                  ? "border-[#facc15] shadow-[0_0_12px_rgba(250,204,21,0.35)]"
                  : sale
                    ? "border-[#22c55e]/40"
                    : "border-border opacity-60",
              )}
            >
              {sale ? (
                <>
                  <span className="absolute right-1 top-1 size-2 rounded-full" style={{ backgroundColor: sale.color }} />
                  <p className="truncate text-[10px] font-bold text-slate-300 line-through decoration-[#22c55e]/60">
                    {p.name}
                  </p>
                  <p className="mt-0.5 truncate text-[8px] font-bold uppercase tracking-wider text-[#22c55e]">
                    {sale.team} · {inr(sale.price)}
                  </p>
                </>
              ) : (
                <>
                  <p className="truncate text-[10px] font-bold text-slate-400">{p.name}</p>
                  <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-600">
                    {isCurrent ? "ON THE BLOCK" : p.role}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Results({ room }: { room: RoomView }) {
  const ranked = room.teams
    .map((t) => {
      const total = t.sold.reduce((s, p) => s + playerRating(p), 0);
      const avg = t.sold.length ? Math.round(total / t.sold.length) : 0;
      const bowlers = t.sold.filter((p) => p.role === "Bowler").length;
      const keepers = t.sold.filter((p) => p.role === "Wicketkeeper").length;
      const balanceBonus = keepers >= 1 && bowlers >= 3 ? 10 : 0;
      return { team: t, total, avg, balanceBonus, score: total + balanceBonus };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const champion = best && best.team.sold.length > 0 ? best : null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-[#facc15]" />
        <h2 className="text-xl font-black uppercase tracking-tight text-white">
          Auction complete — best squad
        </h2>
      </div>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        Squad score = career form rating + balance bonus (≥1 keeper & ≥3 bowlers)
      </p>

      {champion && (
        <div className="mt-4 border border-[#facc15]/50 bg-[#422006]/40 p-5 panel-glow">
          <div className="flex flex-wrap items-center gap-4">
            <Crown className="size-8 text-[#facc15]" />
            <div className="min-w-0 flex-1">
              <MicroLabel className="text-[#facc15]">Champions of the auction</MicroLabel>
              <h3 className="text-2xl font-black uppercase tracking-tight text-white">
                {champion.team.name}
              </h3>
            </div>
            <div className="text-right">
              <p className="score-nums text-3xl font-black text-[#facc15]">{champion.score}</p>
              <MicroLabel className="text-slate-500">squad rating</MicroLabel>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {ranked.map(({ team, total, avg, score, balanceBonus }) => (
          <div key={String(team._id)} className="border border-border bg-card panel-glow">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0" style={{ backgroundColor: team.color }} />
                <span className="truncate text-sm font-extrabold uppercase tracking-tight text-white">
                  {team.name}
                </span>
              </span>
              <span className="score-nums shrink-0 text-sm font-black text-[#facc15]">
                {score}
                {balanceBonus > 0 && <span className="text-[9px] text-[#22c55e]"> +{balanceBonus}</span>}
              </span>
            </div>
            <ul className="divide-y divide-border/60">
              {team.sold.length === 0 && (
                <li className="px-4 py-6 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  No players signed
                </li>
              )}
              {team.sold.map((p) => (
                <li key={p.playerKey} className="flex items-center gap-3 px-4 py-2">
                  <PlayerPhoto
                    name={p.name}
                    wiki={p.wiki}
                    photoUrl={p.photoUrl}
                    className="size-9 shrink-0 rounded-full"
                    textClass="text-xs"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-slate-100">
                      {p.name}
                      {p.teamShort && <span className="ml-1.5 text-[8px] text-[#facc15]">{p.teamShort}</span>}
                    </span>
                    <span className="block text-[9px] font-medium uppercase tracking-wider text-slate-500">
                      {p.role} · rating {playerRating(p)}
                    </span>
                  </span>
                  <span className="score-nums shrink-0 text-xs font-extrabold text-[#22d3ee]">
                    {inr(p.price)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              <span>Total rating {total} · avg {avg}</span>
              <span>{inr(team.purseRemaining)} purse left</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 border border-border bg-card p-4 panel-glow">
        <BallChip symbol="6" kind="boundary" size="md" />
        <p className="flex-1 text-xs leading-relaxed text-slate-400">
          Ratings blend IPL career numbers with recent form. Want another crack
          at the table? Create a fresh room and redraft your dream XI.
        </p>
        <Button
          type="button"
          onClick={() => window.location.assign("/auction")}
          className="rounded-none bg-[#22c55e] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]"
        >
          <Gavel className="size-3.5" /> New auction
        </Button>
      </div>
    </div>
  );
}
