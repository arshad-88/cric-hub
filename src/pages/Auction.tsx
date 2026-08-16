import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { BallChip, MicroLabel, SectionHeading } from "@/components/swiss";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Gavel,
  KeyRound,
  Loader2,
  Sparkles,
  Users,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

function inr(lakhs: number): string {
  if (lakhs >= 100) {
    const cr = lakhs / 100;
    return `₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(1)} Cr`;
  }
  return `₹${lakhs} L`;
}

export default function Auction() {
  const navigate = useNavigate();
  const rooms = useQuery(api.auction.list);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
        {/* hero */}
        <section className="stadium-gradient border border-border">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <div className="flex items-center gap-2">
                <BallChip symbol="G" kind="boundary" size="sm" />
                <MicroLabel className="text-[#facc15]">The auction house</MicroLabel>
              </div>
              <h1 className="mt-3 text-4xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-5xl">
                Build your <span className="text-[#facc15] led-gold">dream</span> XI.
                <br />
                Bid. Bluff. <span className="text-[#22c55e] led-green">Win.</span>
              </h1>
              <p className="mt-3 max-w-xl text-xs leading-relaxed text-slate-400 sm:text-sm">
                Real IPL mega auction or a custom auction from your own local
                tournament — multiplayer, live, and free. Create a room, share
                the 6-digit code with your friends, and run the gavel from any
                phone.
              </p>
            </div>
            <div className="flex items-center gap-6">
              <StatMini value={(rooms ?? []).length} label="Rooms open" />
              <StatMini value="150+" label="IPL 2026 stars" />
              <StatMini value="6-digit" label="Join codes" />
            </div>
          </div>
        </section>

        {/* create + join */}
        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <CreateCard
            kind="ipl"
            onCreated={(id) => navigate(`/auction/${id}`)}
          />
          <CreateCard
            kind="custom"
            onCreated={(id) => navigate(`/auction/${id}`)}
          />
          <JoinCard onJoined={(id) => navigate(`/auction/${id}`)} />
        </section>

        {/* rooms */}
        <section className="mt-10">
          <SectionHeading index="01" title="Auction rooms" className="mb-4" />
          <div className="divide-y divide-border/60 border border-border bg-card panel-glow">
            {(rooms ?? []).length === 0 && (
              <p className="px-4 py-12 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                No rooms yet — create the first auction above
              </p>
            )}
            {(rooms ?? []).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate(`/auction/${r.id}`)}
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#0b1524]/60"
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center text-lg font-black",
                    r.mode === "ipl"
                      ? "bg-[#facc15]/15 text-[#facc15]"
                      : "bg-[#22c55e]/15 text-[#22c55e]",
                  )}
                >
                  {r.mode === "ipl" ? "🏆" : "🏏"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold uppercase tracking-tight text-slate-100">
                    {r.title}
                    <span className="ml-2 text-[9px] text-slate-500">
                      {r.mode === "ipl" ? "REAL IPL" : "LOCAL"}
                    </span>
                  </span>
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Hosted by {r.hostName} · {r.purse ? inr(r.purse) : "—"} purse
                    · {r.teamsCount} teams · {r.soldCount}/{r.playersCount} sold
                  </span>
                </span>
                <span className="score-nums hidden font-mono text-sm font-black tracking-widest text-[#22d3ee] sm:inline">
                  #{r.roomCode}
                </span>
                <AuctionStatus status={r.status} />
                <ArrowRight className="size-4 text-slate-600" />
              </button>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function StatMini({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="text-center">
      <p className="score-nums text-2xl font-black text-white">{value}</p>
      <MicroLabel className="mt-1 block text-slate-500">{label}</MicroLabel>
    </div>
  );
}

function AuctionStatus({ status }: { status: "SETUP" | "LIVE" | "COMPLETED" }) {
  if (status === "LIVE") {
    return (
      <span className="inline-flex items-center gap-1.5 bg-[#ef4444] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white">
        <span className="size-1.5 animate-pulse rounded-full bg-white" /> Live
      </span>
    );
  }
  if (status === "COMPLETED") {
    return (
      <span className="bg-[#22c55e]/15 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[#22c55e]">
        Done
      </span>
    );
  }
  return (
    <span className="bg-[#22d3ee]/15 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[#22d3ee]">
      Waiting
    </span>
  );
}

function CreateCard({
  kind,
  onCreated,
}: {
  kind: "ipl" | "custom";
  onCreated: (id: string) => void;
}) {
  const create = useMutation(api.auction.create);
  const tournaments = useQuery(api.tournaments.list);
  const [title, setTitle] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [purse, setPurse] = useState(kind === "ipl" ? 12000 : 500);
  const [busy, setBusy] = useState(false);

  const isIpl = kind === "ipl";

  const submit = async () => {
    if (!isIpl && !tournamentId) {
      toast.error("Pick the tournament whose players go under the hammer.");
      return;
    }
    setBusy(true);
    try {
      const id = await create({
        mode: isIpl ? "ipl" : "custom",
        title,
        tournamentId: isIpl ? undefined : (tournamentId as Id<"tournaments">),
        purse,
        squadSize: 11,
      });
      toast.success(isIpl ? "IPL auction room created!" : "Local auction room created!");
      onCreated(id as unknown as string);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the auction.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col border bg-card panel-glow",
        isIpl ? "border-[#facc15]/40" : "border-[#22c55e]/40",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border px-4 py-3",
          isIpl ? "bg-[#422006]" : "bg-[#052e16]",
        )}
      >
        <Gavel className={cn("size-4", isIpl ? "text-[#facc15]" : "text-[#22c55e]")} />
        <span className="text-sm font-extrabold uppercase tracking-tight text-white">
          {isIpl ? "Real IPL auction" : "Custom local auction"}
        </span>
        {isIpl && <Sparkles className="ml-auto size-3.5 text-[#facc15]" />}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-[11px] leading-relaxed text-slate-400">
          {isIpl
            ? "150+ real IPL 2026 players — every franchise's squad plus the marquee names back in the pool — with career + recent-form stats and player photos. Multiplayer, auction11-style."
            : "Every player from a tournament you organize — their career stats from all leagues come along automatically."}
        </p>
        <Field label="Room title (optional)">
          <Input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isIpl ? "Saturday Night Mega Auction" : "Society Cup Auction"}
          />
        </Field>
        {!isIpl && (
          <Field label="Tournament">
            <Select value={tournamentId} onValueChange={setTournamentId}>
              <SelectTrigger className={inputCls}>
                <SelectValue placeholder="Choose a tournament…" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border bg-card">
                {(tournaments ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Purse per team">
          <Select value={String(purse)} onValueChange={(v) => setPurse(Number(v))}>
            <SelectTrigger className={inputCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none border-border bg-card">
              {[400, 500, 1000, 2500, 5000, 10000, 12000].map((p) => (
                <SelectItem key={p} value={String(p)}>
                  {inr(p)} per team
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="mt-auto pt-2">
          <Button
            type="button"
            disabled={busy}
            onClick={submit}
            className={cn(
              "w-full rounded-none text-[10px] font-black uppercase tracking-widest",
              isIpl
                ? "bg-[#facc15] text-[#422006] hover:bg-[#22c55e] hover:text-[#052e16]"
                : "bg-[#22c55e] text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]",
            )}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Gavel className="size-3.5" />}
            {isIpl ? "Create IPL auction" : "Create custom auction"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function JoinCard({ onJoined }: { onJoined: (id: string) => void }) {
  const [code, setCode] = useState("");
  const byCode = useQuery(
    api.auction.getByCode,
    code.replace(/\D/g, "").length >= 4 ? { code } : "skip",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    if (!byCode) {
      setError("No room found with that code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onJoined(byCode as unknown as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col border border-[#22d3ee]/40 bg-card panel-glow">
      <div className="flex items-center gap-2 border-b border-border bg-[#083344] px-4 py-3">
        <KeyRound className="size-4 text-[#22d3ee]" />
        <span className="text-sm font-extrabold uppercase tracking-tight text-white">
          Join with a code
        </span>
        <Users className="ml-auto size-3.5 text-[#22d3ee]" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-[11px] leading-relaxed text-slate-400">
          Your friend created a room — enter their 6-digit code to take a seat
          at the auction table and build your own XI.
        </p>
        <Field label="Room code">
          <Input
            className={cn(inputCls, "text-center font-mono text-xl tracking-[0.5em]")}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
          />
        </Field>
        {error && (
          <p className="border border-[#ef4444]/50 bg-[#ef4444]/10 px-3 py-2 text-[10px] font-bold text-[#ef4444]">
            {error}
          </p>
        )}
        <Button
          type="button"
          disabled={busy || !byCode}
          onClick={join}
          className="mt-auto w-full rounded-none bg-[#22d3ee] text-[10px] font-black uppercase tracking-widest text-[#083344] hover:bg-[#facc15] hover:text-[#422006]"
        >
          <KeyRound className="size-3.5" /> Enter the auction
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
        {label}
      </Label>
      {children}
    </div>
  );
}

const inputCls =
  "h-10 rounded-none border-border bg-[#0b1524] text-xs text-slate-200 placeholder:text-slate-600 focus-visible:border-[#22c55e] focus-visible:ring-[#22c55e]/30";
