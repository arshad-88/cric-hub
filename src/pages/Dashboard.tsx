import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MicroLabel, StatusPill, TeamMark } from "@/components/swiss";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/format";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  Clapperboard,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

const BALL_TYPES = ["Grace Ball", "Leather", "Tennis"] as const;
const TEAM_ROLES = ["Player", "Captain", "Vice-Captain"] as const;
const STAGES = ["Group", "Quarter-final", "Semi-final", "Final"] as const;
const BATTING_STYLES = ["Right-hand bat", "Left-hand bat"] as const;
const BOWLING_STYLES = [
  "Right-arm fast",
  "Right-arm fast medium",
  "Right-arm medium",
  "Right-arm off spin",
  "Leg spin",
  "Leg spin googly",
  "Left-arm fast",
  "Left-arm fast medium",
  "Left-arm medium",
  "Left-arm orthodox",
  "Left-arm chinaman",
  "Left-arm medium fast",
] as const;

type BallType = (typeof BALL_TYPES)[number];
type PlayerRole = "Batsman" | "Bowler" | "All-rounder" | "Wicketkeeper";
type TeamRole = (typeof TEAM_ROLES)[number];
type Stage = (typeof STAGES)[number];

interface TeamDoc {
  _id: Id<"teams">;
  tournamentId: Id<"tournaments">;
  name: string;
  shortCode: string;
  color: string;
  logoUrl?: string;
  coach?: string;
}

interface PlayerDoc {
  _id: Id<"players">;
  teamId: Id<"teams">;
  name: string;
  phone?: string;
  role: PlayerRole;
  battingStyle?: string;
  bowlingStyle?: string;
  jerseyNumber?: number;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
}

interface TournamentRow {
  id: string;
  name: string;
  year: number;
  status: string;
  teamsCount: number;
  matchesCount: number;
  liveMatchId?: string | null;
  organizers?: string[];
}

export default function Dashboard() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const tournaments = useQuery(api.tournaments.list);
  const myTours = (tournaments ?? []).filter(
    (t) => user && t.organizers?.includes(user._id),
  );
  const [tournamentId, setTournamentId] = useState<string>("");

  // default the working tournament to the first one the user organizes
  const defaultTournamentId = myTours[0]?.id;
  if (defaultTournamentId && !tournamentId) {
    setTournamentId(defaultTournamentId);
  }

  const working = tournaments?.find((t) => t.id === tournamentId) ?? null;
  const workingDoc = useQuery(
    api.tournaments.get,
    tournamentId ? { tournamentId: tournamentId as Id<"tournaments"> } : "skip",
  );
  const canManage = working
    ? working.organizers?.includes(user?._id ?? "") ?? false
    : false;

  const stats = useQuery(
    api.admin.hubStats,
    tournamentId ? { tournamentId: tournamentId as Id<"tournaments"> } : "skip",
  );
  const teams = useQuery(
    api.teams.listByTournament,
    tournamentId
      ? { tournamentId: tournamentId as Id<"tournaments"> }
      : "skip",
  );
  const roster = useQuery(
    api.players.listByTournament,
    tournamentId
      ? { tournamentId: tournamentId as Id<"tournaments"> }
      : "skip",
  );
  const matches = useQuery(
    api.matches.list,
    tournamentId
      ? { tournamentId: tournamentId as Id<"tournaments"> }
      : "skip",
  );

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* hub header */}
      <header className="sticky top-0 z-40 border-b border-border bg-[#0b1524]/95 backdrop-blur">
        <div className="h-0.5 bg-gradient-to-r from-[#22c55e] via-[#facc15] to-[#22d3ee]" aria-hidden />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="size-3.5" /> Public site
            </Link>
            <span className="hidden items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#22c55e] sm:inline-flex">
              <Trophy className="size-3.5" /> My Hub
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span className="micro-label hidden max-w-48 truncate text-slate-500 md:inline">
              {user?.name ?? "Signed in"} · {user?.phone ?? ""}
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-none border-border text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:text-white"
              onClick={handleSignOut}
            >
              <LogOut className="size-3" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">
              My Hub
            </h1>
            <p className="mt-1 text-[11px] uppercase tracking-widest text-slate-500">
              Create tournaments · manage the ones you organize · score live
            </p>
          </div>
          <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
            <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Working tournament
            </Label>
            <Select value={tournamentId || undefined} onValueChange={setTournamentId}>
              <SelectTrigger className="h-10 w-full rounded-none border-border bg-card text-xs text-slate-200 sm:w-72">
                <SelectValue placeholder="Select tournament" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border bg-card">
                {(tournaments ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.year} — {t.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* profile + stats */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <ProfileCard />
          <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-5 lg:col-span-2">
            <StatTile value={stats?.counts.teams ?? "—"} label="Teams" />
            <StatTile value={stats?.counts.players ?? "—"} label="Players" />
            <StatTile value={stats?.counts.upcoming ?? "—"} label="Upcoming" tone="gold" />
            <StatTile value={stats?.counts.live ?? "—"} label="Live" tone="red" />
            <StatTile value={stats?.counts.completed ?? "—"} label="Completed" tone="cyan" />
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <section>
            <SectionTitle index="01" title="Start a new tournament" />
            <TournamentCreator onCreated={(id) => setTournamentId(id)} />
            <div className="mt-6">
              <SectionTitle index="02" title="Tournaments I organize" />
              <MyTournamentList
                tournaments={myTours}
                workingId={tournamentId}
                onSelect={setTournamentId}
              />
            </div>
          </section>

          <section>
            <SectionTitle index="03" title="Manage tournament" />
            {working ? (
              canManage ? (
                <ManagePanel
                  tournamentId={tournamentId as Id<"tournaments">}
                  tournament={workingDoc ?? null}
                  teams={teams ?? []}
                  players={roster?.players ?? []}
                  matches={matches ?? []}
                  organizers={stats?.organizers ?? []}
                  onDeleted={() => setTournamentId("")}
                />
              ) : (
                <div className="border border-border bg-card p-6 text-center panel-glow">
                  <KeyRound className="mx-auto size-7 text-[#facc15]" />
                  <p className="mt-3 text-sm font-extrabold uppercase tracking-tight text-white">
                    You don't organize this one yet
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    {working.name} {working.year} is managed by its organizers.
                    Ask them to add your phone number and you'll be able to
                    manage teams and score matches here.
                  </p>
                  <Link
                    to={`/matches?tournament=${working.id}`}
                    className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#22d3ee] hover:underline"
                  >
                    View it publicly <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              )
            ) : (
              <div className="border border-border bg-card p-6 text-center panel-glow">
                <Plus className="mx-auto size-7 text-[#22c55e]" />
                <p className="mt-3 text-sm font-extrabold uppercase tracking-tight text-white">
                  Nothing selected yet
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  Create a tournament or pick one you organize to manage teams,
                  rosters, fixtures and scoring.
                </p>
              </div>
            )}
          </section>
        </div>

        <div className="mt-10">
          <SectionTitle index="04" title="All tournaments" />
          <TournamentDirectory tournaments={tournaments ?? []} />
        </div>
      </main>
    </div>
  );
}

// ---- atoms ----------------------------------------------------------------

function SectionTitle({ index, title }: { index: string; title: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="score-nums text-sm font-extrabold text-[#22c55e] led-green">{index}</span>
      <h2 className="text-base font-extrabold uppercase tracking-tight text-white">{title}</h2>
      <span className="flex-1 self-center border-t border-border" aria-hidden />
    </div>
  );
}

function StatTile({
  value,
  label,
  tone = "green",
}: {
  value: number | string;
  label: string;
  tone?: "green" | "gold" | "red" | "cyan";
}) {
  const toneCls = {
    green: "text-[#22c55e]",
    gold: "text-[#facc15]",
    red: "text-[#ef4444]",
    cyan: "text-[#22d3ee]",
  }[tone];
  return (
    <div className="bg-card px-4 py-4 text-center panel-glow">
      <p className={cn("score-nums text-2xl font-black", toneCls)}>{value}</p>
      <MicroLabel className="mt-1 block text-slate-500">{label}</MicroLabel>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
        {label}
      </Label>
      {children}
    </div>
  );
}

const inputCls =
  "h-10 rounded-none border-border bg-[#0b1524] text-xs text-slate-200 placeholder:text-slate-600 focus-visible:border-[#22c55e] focus-visible:ring-[#22c55e]/30";

// ---- profile ---------------------------------------------------------------

function ProfileCard() {
  const { user } = useAuth();
  const updateProfile = useMutation(api.users.updateProfile);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      toast.success("Profile updated — this name & number follow you everywhere.");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border bg-card p-4 panel-glow">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-base font-black text-[#052e16]">
          {(user?.name ?? "P").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-1.5">
              <Input
                className="h-8 rounded-none border-border bg-[#0b1524] text-xs text-slate-200"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
              <Input
                className="h-8 rounded-none border-border bg-[#0b1524] text-xs text-slate-200"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number (player identity)"
                inputMode="tel"
              />
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  disabled={busy}
                  className="h-8 shrink-0 rounded-none bg-[#22c55e] px-2 text-[9px] font-black uppercase tracking-widest text-[#052e16]"
                  onClick={save}
                >
                  Save
                </Button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="truncate text-sm font-extrabold text-white">
                {user?.name ?? "Player"}
              </p>
              <p className="score-nums truncate text-[10px] font-bold text-slate-500">
                {user?.phone ?? "No phone set"}
              </p>
            </>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setName(user?.name ?? "");
              setPhone(user?.phone ?? "");
              setEditing(true);
            }}
            className="inline-flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-[#22d3ee]"
          >
            <Pencil className="size-3" /> Edit
          </button>
        )}
      </div>
      <p className="mt-3 border-t border-border pt-3 text-[10px] leading-relaxed text-slate-500">
        Add your phone number — organizers type it when building rosters and
        your name plus every stat you've ever scored comes along automatically.
      </p>
    </div>
  );
}

// ---- 01: tournament creator ------------------------------------------------

function TournamentCreator({ onCreated }: { onCreated: (id: string) => void }) {
  const create = useMutation(api.tournaments.create);
  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [city, setCity] = useState("");
  const [ballType, setBallType] = useState<BallType>("Grace Ball");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [description, setDescription] = useState("");
  const [defaultOvers, setDefaultOvers] = useState(20);
  const [makeActive, setMakeActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give the tournament a name.");
      return;
    }
    setBusy(true);
    try {
      const id = await create({
        name: name.trim(),
        year,
        description: description.trim() || undefined,
        city: city.trim() || undefined,
        ballType,
        startDate: startDate ? new Date(startDate).getTime() : undefined,
        endDate: endDate ? new Date(endDate).getTime() : undefined,
        bannerUrl: bannerUrl.trim() || undefined,
        defaultOvers,
        makeActive,
      });
      toast.success("Tournament created — you are the organizer.");
      onCreated(id as unknown as string);
      setName("");
      setCity("");
      setBannerUrl("");
      setDescription("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the tournament.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border bg-card p-4 panel-glow">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tournament name">
          <Input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Friends Premier League" />
        </Field>
        <Field label="Year">
          <Input className={inputCls} type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())} />
        </Field>
        <Field label="City / venue hub">
          <Input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hyderabad" />
        </Field>
        <Field label="Ball type">
          <Select value={ballType} onValueChange={(v) => setBallType(v as BallType)}>
            <SelectTrigger className={inputCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none border-border bg-card">
              {BALL_TYPES.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Start date">
          <Input className={inputCls} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="End date">
          <Input className={inputCls} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label="Default overs per match">
          <Input className={inputCls} type="number" min={1} max={50} value={defaultOvers} onChange={(e) => setDefaultOvers(Number(e.target.value) || 20)} />
        </Field>
        <Field label="Banner image URL">
          <Input className={inputCls} value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Eight teams, one trophy…" />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <input
            type="checkbox"
            checked={makeActive}
            onChange={(e) => setMakeActive(e.target.checked)}
            className="size-3.5 accent-[#22c55e]"
          />
          Feature on the landing page
        </label>
        <Button
          type="button"
          className="rounded-none bg-[#22c55e] text-[10px] font-black uppercase tracking-widest text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]"
          onClick={submit}
          disabled={busy}
        >
          <Plus className="size-3.5" /> Create tournament
        </Button>
      </div>
    </div>
  );
}

// ---- 02: my tournaments ----------------------------------------------------

function MyTournamentList({
  tournaments,
  workingId,
  onSelect,
}: {
  tournaments: TournamentRow[];
  workingId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="divide-y divide-border/60 border border-border bg-card panel-glow">
      {tournaments.length === 0 && (
        <p className="px-3 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
          You don't organize any tournament yet — create the first one above.
        </p>
      )}
      {tournaments.map((t) => (
        <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn(
              "min-w-0 flex-1 text-left",
              workingId === t.id ? "" : "opacity-70 hover:opacity-100",
            )}
          >
            <span className="block truncate text-sm font-bold text-slate-100">
              {t.name} <span className="text-slate-500">{t.year}</span>
              {workingId === t.id && <span className="ml-1.5 text-[#22c55e]">●</span>}
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {t.status} · {t.teamsCount} teams · {t.matchesCount} matches
            </span>
          </button>
          <Link
            to={`/matches?tournament=${t.id}`}
            className="text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-[#22d3ee]"
          >
            Public
          </Link>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-none border-border text-[9px] font-bold uppercase tracking-widest text-slate-300 hover:text-[#22c55e]"
            onClick={() => onSelect(t.id)}
          >
            Manage
          </Button>
        </div>
      ))}
    </div>
  );
}

// ---- 04: tournament directory ----------------------------------------------

function TournamentDirectory({ tournaments }: { tournaments: TournamentRow[] }) {
  return (
    <div className="divide-y divide-border/60 border border-border bg-card panel-glow">
      {tournaments.length === 0 && (
        <p className="px-3 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
          No tournaments on the platform yet — be the first to create one.
        </p>
      )}
      {tournaments.map((t) => (
        <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-slate-100">
              {t.name} <span className="text-slate-500">{t.year}</span>
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {t.status} · {t.teamsCount} teams · {t.matchesCount} matches
            </span>
          </span>
          <StatusPill
            status={
              t.status === "ACTIVE"
                ? "LIVE"
                : t.status === "UPCOMING"
                  ? "UPCOMING"
                  : "COMPLETED"
            }
          />
          <Link
            to={`/matches?tournament=${t.id}`}
            className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-[#22d3ee] hover:underline"
          >
            View <ArrowRight className="size-3" />
          </Link>
        </div>
      ))}
    </div>
  );
}

// ---- 03: manage panel ------------------------------------------------------

function ManagePanel({
  tournamentId,
  tournament,
  teams,
  players,
  matches,
  organizers,
  onDeleted,
}: {
  tournamentId: Id<"tournaments">;
  tournament: {
    name: string;
    year: number;
    description?: string;
    city?: string;
    ballType?: string;
    startDate?: number;
    endDate?: number;
    bannerUrl?: string;
    defaultOvers?: number;
  } | null;
  teams: TeamDoc[];
  players: PlayerDoc[];
  matches: {
    id: string;
    status: "UPCOMING" | "LIVE" | "COMPLETED";
    overs: number;
    stage?: string;
    startTime: number;
    streamUrl?: string;
    venue?: string;
    result?: string;
    teamA?: { name: string; shortCode: string; color: string } | null;
    teamB?: { name: string; shortCode: string; color: string } | null;
  }[];
  organizers: { id: string; name: string; phone: string; isCreator: boolean }[];
  onDeleted: () => void;
}) {
  return (
    <div className="space-y-6">
      {tournament && (
        <TournamentSettings
          tournamentId={tournamentId}
          tournament={tournament}
          onDeleted={onDeleted}
        />
      )}
      <OrganizerManager tournamentId={tournamentId} organizers={organizers} />
      <TeamManager tournamentId={tournamentId} teams={teams} players={players} />
      <MatchScheduler tournamentId={tournamentId} teams={teams} />
      <FixtureList matches={matches} />
    </div>
  );
}

/** Organizer controls for fixing mistyped details + deleting the tournament. */
function TournamentSettings({
  tournamentId,
  tournament,
  onDeleted,
}: {
  tournamentId: Id<"tournaments">;
  tournament: {
    name: string;
    year: number;
    description?: string;
    city?: string;
    ballType?: string;
    startDate?: number;
    endDate?: number;
    bannerUrl?: string;
    defaultOvers?: number;
  };
  onDeleted: () => void;
}) {
  const update = useMutation(api.tournaments.update);
  const remove = useMutation(api.tournaments.remove);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(tournament.name);
  const [year, setYear] = useState(tournament.year);
  const [city, setCity] = useState(tournament.city ?? "");
  const [ballType, setBallType] = useState<BallType>(
    (BALL_TYPES as readonly string[]).includes(tournament.ballType ?? "")
      ? (tournament.ballType as BallType)
      : "Grace Ball",
  );
  const [description, setDescription] = useState(tournament.description ?? "");
  const [startDate, setStartDate] = useState(
    tournament.startDate ? toDateInput(tournament.startDate) : "",
  );
  const [endDate, setEndDate] = useState(
    tournament.endDate ? toDateInput(tournament.endDate) : "",
  );
  const [bannerUrl, setBannerUrl] = useState(tournament.bannerUrl ?? "");
  const [defaultOvers, setDefaultOvers] = useState(tournament.defaultOvers ?? 20);

  const startEdit = () => {
    setName(tournament.name);
    setYear(tournament.year);
    setCity(tournament.city ?? "");
    setBallType(
      (BALL_TYPES as readonly string[]).includes(tournament.ballType ?? "")
        ? (tournament.ballType as BallType)
        : "Grace Ball",
    );
    setDescription(tournament.description ?? "");
    setStartDate(tournament.startDate ? toDateInput(tournament.startDate) : "");
    setEndDate(tournament.endDate ? toDateInput(tournament.endDate) : "");
    setBannerUrl(tournament.bannerUrl ?? "");
    setDefaultOvers(tournament.defaultOvers ?? 20);
    setEditing(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Tournament name can't be empty.");
      return;
    }
    setBusy(true);
    try {
      await update({
        tournamentId,
        name: name.trim(),
        year,
        description: description.trim() || undefined,
        city: city.trim() || undefined,
        ballType,
        startDate: startDate ? new Date(startDate).getTime() : undefined,
        endDate: endDate ? new Date(endDate).getTime() : undefined,
        bannerUrl: bannerUrl.trim() || undefined,
        defaultOvers,
      });
      toast.success("Tournament details saved.");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await remove({ tournamentId });
      toast.success("Tournament deleted — its teams, players and match history are gone.");
      setConfirmOpen(false);
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the tournament.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border bg-card panel-glow">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-[#0b1524] px-3 py-2.5">
        <Trophy className="size-3.5 text-[#facc15]" />
        <span className="text-sm font-extrabold uppercase tracking-tight text-white">
          Tournament settings
        </span>
        <span className="micro-label ml-auto text-slate-500">
          fix mistakes · delete history
        </span>
      </div>

      {!editing ? (
        <div className="flex flex-wrap items-center gap-2 px-3 py-3">
          <span className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {tournament.name} {tournament.year} · {tournament.city ?? "No city"} ·{" "}
            {tournament.defaultOvers ?? "—"} overs default
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-none border-border text-[9px] font-bold uppercase tracking-widest text-slate-300 hover:text-[#22c55e]"
            onClick={startEdit}
          >
            <Pencil className="size-3" /> Edit details
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-none border-[#ef4444]/40 text-[9px] font-bold uppercase tracking-widest text-[#ef4444] hover:bg-[#ef4444]/10"
            onClick={() => {
              setConfirmName("");
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="size-3" /> Delete tournament
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 px-3 py-3 sm:grid-cols-2">
          <Field label="Tournament name">
            <Input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Year">
            <Input className={inputCls} type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || tournament.year)} />
          </Field>
          <Field label="City / venue hub">
            <Input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Ball type">
            <Select value={ballType} onValueChange={(v) => setBallType(v as BallType)}>
              <SelectTrigger className={inputCls}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border bg-card">
                {BALL_TYPES.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Start date">
            <Input className={inputCls} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date">
            <Input className={inputCls} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="Default overs per match">
            <Input className={inputCls} type="number" min={1} max={50} value={defaultOvers} onChange={(e) => setDefaultOvers(Number(e.target.value) || 20)} />
          </Field>
          <Field label="Banner image URL">
            <Input className={inputCls} value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-none bg-[#22c55e] text-[10px] font-black uppercase tracking-widest text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]"
            >
              Save changes
            </Button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* delete confirmation — type the tournament name to arm it */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(false)}>
        <DialogContent className="rounded-none border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="uppercase text-[#ef4444]">Delete this tournament?</DialogTitle>
            <DialogDescription>
              This permanently removes <span className="font-bold text-white">{tournament.name}</span>{" "}
              and <strong>everything inside it</strong> — teams, players, fixtures, every
              ball-by-ball delivery, stats and follows. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Type the tournament name to confirm
            </Label>
            <Input
              className="rounded-none border-border bg-[#0b1524] text-slate-200"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={tournament.name}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-none border-border uppercase text-slate-300"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-none bg-[#ef4444] uppercase text-white hover:bg-[#dc2626]"
              disabled={busy || confirmName.trim() !== tournament.name}
              onClick={confirmDelete}
            >
              <Trash2 className="size-4" /> Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toDateInput(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function OrganizerManager({
  tournamentId,
  organizers,
}: {
  tournamentId: Id<"tournaments">;
  organizers: { id: string; name: string; phone: string; isCreator: boolean }[];
}) {
  const addOrganizer = useMutation(api.tournaments.addOrganizer);
  const removeOrganizer = useMutation(api.tournaments.removeOrganizer);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!phone.replace(/\D/g, "")) {
      toast.error("Enter a phone number.");
      return;
    }
    setBusy(true);
    try {
      await addOrganizer({
        tournamentId,
        phone: phone.replace(/\D/g, ""),
      });
      toast.success("Co-organizer added — they can now manage and score.");
      setPhone("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add organizer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border bg-card panel-glow">
      <div className="flex items-center gap-2 border-b border-border bg-[#0b1524] px-3 py-2.5">
        <Users className="size-3.5 text-[#22c55e]" />
        <span className="text-sm font-extrabold uppercase tracking-tight text-white">
          Organizers
        </span>
        <span className="micro-label ml-auto text-slate-500">
          who can edit & score
        </span>
      </div>
      <ul className="divide-y divide-border/60">
        {organizers.length === 0 && (
          <li className="px-3 py-6 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Loading organizers…
          </li>
        )}
        {organizers.map((o) => (
          <li key={o.id} className="flex items-center gap-3 px-3 py-2">
            <span className="flex size-7 shrink-0 items-center justify-center bg-[#22c55e]/15 text-[10px] font-black text-[#22c55e]">
              {o.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-slate-100">
                {o.name}{" "}
                {o.isCreator && (
                  <span className="text-[9px] uppercase text-[#facc15]">· creator</span>
                )}
              </span>
              <span className="score-nums block text-[10px] font-bold text-slate-500">{o.phone}</span>
            </span>
            {!o.isCreator && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await removeOrganizer({
                      tournamentId,
                      userId: o.id as Id<"users">,
                    });
                    toast.success("Co-organizer removed.");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not remove.");
                  }
                }}
                className="text-slate-600 transition-colors hover:text-[#ef4444]"
                title="Remove organizer"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        <Input
          className="h-9 rounded-none border-border bg-[#0b1524] text-[11px] text-slate-200"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Co-organizer phone number"
          inputMode="tel"
        />
        <Button
          type="button"
          disabled={busy}
          onClick={add}
          className="h-9 shrink-0 rounded-none bg-[#22c55e] px-3 text-[9px] font-black uppercase tracking-widest text-[#052e16] hover:bg-[#facc15]"
        >
          <Plus className="size-3" /> Add
        </Button>
      </div>
      <p className="border-t border-border px-3 py-2 text-[9px] uppercase tracking-widest text-slate-600">
        They must have signed in with that number first.
      </p>
    </div>
  );
}

// ---- teams & rosters -------------------------------------------------------

function TeamManager({
  tournamentId,
  teams,
  players,
}: {
  tournamentId: Id<"tournaments">;
  teams: TeamDoc[];
  players: PlayerDoc[];
}) {
  const [teamId, setTeamId] = useState<string>("");
  const [editingTeam, setEditingTeam] = useState(false);
  const selectedTeam = teams.find((t) => t._id === teamId) ?? null;
  const squad = players.filter((p) => p.teamId === teamId);

  return (
    <div className="space-y-4">
      <CreateTeamForm tournamentId={tournamentId} onCreated={(id) => { setTeamId(id); setEditingTeam(false); }} />

      {teams.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {teams.map((t) => (
            <button
              key={t._id}
              type="button"
              onClick={() => setTeamId(t._id)}
              className={cn(
                "flex items-center gap-2.5 border px-3 py-2.5 text-left transition-colors",
                teamId === t._id
                  ? "border-[#22c55e] bg-[#22c55e]/[0.08]"
                  : "border-border bg-card hover:border-slate-600",
              )}
            >
              <TeamMark shortCode={t.shortCode} color={t.color} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-extrabold uppercase tracking-wide text-slate-100">
                  {t.name}
                </span>
                <span className="block text-[9px] font-medium uppercase tracking-wider text-slate-500">
                  {players.filter((p) => p.teamId === t._id).length} players
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedTeam && !editingTeam && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditingTeam(true)}
            className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-[#22c55e]"
          >
            <Pencil className="size-3" /> Edit team details
          </button>
        </div>
      )}
      {selectedTeam && editingTeam && (
        <TeamEditForm
          team={selectedTeam}
          onDone={() => setEditingTeam(false)}
        />
      )}
      {selectedTeam && <RosterEditor team={selectedTeam} squad={squad} />}
      {!selectedTeam && teams.length === 0 && (
        <p className="border border-border bg-card px-3 py-6 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Add a team above to start building a roster
        </p>
      )}
    </div>
  );
}

function CreateTeamForm({
  tournamentId,
  onCreated,
}: {
  tournamentId: Id<"tournaments">;
  onCreated: (teamId: string) => void;
}) {
  const create = useMutation(api.teams.create);
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [color, setColor] = useState("#22c55e");
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !shortCode.trim()) {
      toast.error("Team name and short code are required.");
      return;
    }
    setBusy(true);
    try {
      const id = await create({
        tournamentId,
        name: name.trim(),
        shortCode: shortCode.trim(),
        color,
        logoUrl: logoUrl.trim() || undefined,
      });
      toast.success("Team added.");
      onCreated(id as unknown as string);
      setName("");
      setShortCode("");
      setLogoUrl("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the team.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border bg-card p-4 panel-glow">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Team name">
          <Input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunrise Strikers" />
        </Field>
        <Field label="Short code">
          <Input className={inputCls} value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="SS" maxLength={4} />
        </Field>
        <Field label="Primary color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 cursor-pointer border border-border bg-[#0b1524] p-1"
            />
            <Input className={inputCls} value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </Field>
        <Field label="Logo URL">
          <Input className={inputCls} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
        </Field>
      </div>
      <Button
        type="button"
        className="mt-3 w-full rounded-none bg-[#22d3ee] text-[10px] font-black uppercase tracking-widest text-[#083344] hover:bg-[#facc15] hover:text-[#422006]"
        onClick={submit}
        disabled={busy}
      >
        <Plus className="size-3.5" /> Add team
      </Button>
    </div>
  );
}

function TeamEditForm({ team, onDone }: { team: TeamDoc; onDone: () => void }) {
  const update = useMutation(api.teams.update);
  const [name, setName] = useState(team.name);
  const [shortCode, setShortCode] = useState(team.shortCode);
  const [color, setColor] = useState(team.color);
  const [logoUrl, setLogoUrl] = useState(team.logoUrl ?? "");
  const [coach, setCoach] = useState(team.coach ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || !shortCode.trim()) {
      toast.error("Team name and short code are required.");
      return;
    }
    setBusy(true);
    try {
      await update({
        teamId: team._id,
        name: name.trim(),
        shortCode: shortCode.trim(),
        color,
        logoUrl: logoUrl.trim() || undefined,
        coach: coach.trim() || undefined,
      });
      toast.success("Team details saved.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the team.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border bg-card p-4 panel-glow">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Team name">
          <Input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Short code">
          <Input className={inputCls} value={shortCode} onChange={(e) => setShortCode(e.target.value)} maxLength={4} />
        </Field>
        <Field label="Primary color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 cursor-pointer border border-border bg-[#0b1524] p-1"
            />
            <Input className={inputCls} value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </Field>
        <Field label="Logo URL">
          <Input className={inputCls} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Coach / mentor (optional)">
          <Input className={inputCls} value={coach} onChange={(e) => setCoach(e.target.value)} placeholder="Coach name" />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-none bg-[#22c55e] text-[10px] font-black uppercase tracking-widest text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]"
        >
          Save team
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RosterEditor({ team, squad }: { team: TeamDoc; squad: PlayerDoc[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = squad.find((p) => p._id === editingId) ?? null;

  return (
    <div className="border border-border bg-card panel-glow">
      <div className="flex items-center gap-2.5 border-b border-border bg-[#0b1524] px-3 py-2.5">
        <TeamMark shortCode={team.shortCode} color={team.color} size="sm" />
        <span className="truncate text-sm font-extrabold uppercase tracking-tight text-white">
          {team.name}
        </span>
        <span className="micro-label ml-auto flex items-center gap-1 text-slate-500">
          <Users className="size-3" /> {squad.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2.5">
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-none border-border text-[9px] font-bold uppercase tracking-widest text-[#22c55e]"
          onClick={() => {
            setEditingId(null);
            setAdding((v) => !v);
          }}
        >
          <Plus className="size-3" /> Add player
        </Button>
        {editing && (
          <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Editing {editing.name}
            <button
              type="button"
              className="text-[#ef4444] hover:underline"
              onClick={() => setEditingId(null)}
            >
              Cancel
            </button>
          </span>
        )}
      </div>

      {adding && <PlayerForm teamId={team._id} onDone={() => setAdding(false)} />}
      {editing && <PlayerForm teamId={team._id} player={editing} onDone={() => setEditingId(null)} />}

      <ul className="divide-y divide-border/60">
        {squad.length === 0 && (
          <li className="px-3 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Empty squad — add players above
          </li>
        )}
        {squad.map((p) => (
          <li key={p._id} className="flex items-center gap-3 px-3 py-2">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {p.jerseyNumber != null && (
                <span className="score-nums w-6 shrink-0 text-center text-[10px] font-black text-slate-500">
                  {p.jerseyNumber}
                </span>
              )}
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="block truncate text-sm font-bold text-slate-100">{p.name}</span>
                  {p.isCaptain && (
                    <span className="shrink-0 bg-[#facc15] px-1 py-0.5 text-[8px] font-extrabold uppercase tracking-widest text-[#422006]">C</span>
                  )}
                  {p.isViceCaptain && (
                    <span className="shrink-0 bg-[#22d3ee] px-1 py-0.5 text-[8px] font-extrabold uppercase tracking-widest text-[#083344]">VC</span>
                  )}
                </span>
                <span className="block truncate text-[10px] uppercase tracking-wider text-slate-500">
                  {[p.battingStyle, p.bowlingStyle].filter(Boolean).join(" · ") || "Bats & bowls"}
                </span>
              </span>
            </span>
            <button
              type="button"
              onClick={() => setEditingId(p._id)}
              className="text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-[#22d3ee]"
            >
              Edit
            </button>
            <RemovePlayer player={p} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RemovePlayer({ player }: { player: PlayerDoc }) {
  const remove = useMutation(api.players.remove);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await remove({ playerId: player._id });
          toast.success(`${player.name} removed.`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not remove player.");
        } finally {
          setBusy(false);
        }
      }}
      className="text-slate-600 transition-colors hover:text-[#ef4444] disabled:opacity-40"
      title="Remove player"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

function PlayerForm({
  teamId,
  player,
  onDone,
}: {
  teamId: Id<"teams">;
  player?: PlayerDoc;
  onDone: () => void;
}) {
  const create = useMutation(api.players.create);
  const update = useMutation(api.players.update);
  const [name, setName] = useState(player?.name ?? "");
  const [teamRole, setTeamRole] = useState<TeamRole>(
    player?.isCaptain ? "Captain" : player?.isViceCaptain ? "Vice-Captain" : "Player",
  );
  const [battingStyle, setBattingStyle] = useState(player?.battingStyle ?? "");
  const [bowlingStyle, setBowlingStyle] = useState(player?.bowlingStyle ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Player name is required.");
      return;
    }
    setBusy(true);
    try {
      const common = {
        isCaptain: teamRole === "Captain" || undefined,
        isViceCaptain: teamRole === "Vice-Captain" || undefined,
        battingStyle: battingStyle || undefined,
        bowlingStyle: bowlingStyle || undefined,
      };
      if (player) {
        await update({ playerId: player._id, name: name.trim(), ...common });
        toast.success("Player updated.");
      } else {
        await create({ teamId, name: name.trim(), ...common });
        toast.success("Player added to the squad.");
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the player.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 border-b border-border bg-[#0b1524]/60 px-3 py-3 sm:grid-cols-2">
      <Field label="Player name" className="sm:col-span-2">
        <Input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
        />
      </Field>
      <p className="sm:col-span-2 -mt-1 text-[9px] uppercase tracking-widest text-slate-600">
        Every player bats and bowls — no role to pick.
      </p>
      <Field label="Team role">
        <Select value={teamRole} onValueChange={(v) => setTeamRole(v as TeamRole)}>
          <SelectTrigger className={inputCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none border-border bg-card">
            {TEAM_ROLES.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Batting style">
        <Select value={battingStyle || "none"} onValueChange={(v) => setBattingStyle(v === "none" ? "" : v)}>
          <SelectTrigger className={inputCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none border-border bg-card">
            <SelectItem value="none">— none —</SelectItem>
            {BATTING_STYLES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Bowling style">
        <Select value={bowlingStyle || "none"} onValueChange={(v) => setBowlingStyle(v === "none" ? "" : v)}>
          <SelectTrigger className={inputCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto rounded-none border-border bg-card">
            <SelectItem value="none">— none —</SelectItem>
            {BOWLING_STYLES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="flex items-end gap-2">
        <Button
          type="button"
          className="flex-1 rounded-none bg-[#22c55e] text-[10px] font-black uppercase tracking-widest text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]"
          onClick={submit}
          disabled={busy}
        >
          {player ? "Save player" : "Add player"}
        </Button>
      </div>
    </div>
  );
}

// ---- fixtures --------------------------------------------------------------

function MatchScheduler({
  tournamentId,
  teams,
}: {
  tournamentId: Id<"tournaments">;
  teams: TeamDoc[];
}) {
  const create = useMutation(api.matches.create);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [overs, setOvers] = useState(20);
  const [venue, setVenue] = useState("");
  const [stage, setStage] = useState<Stage>("Group");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [streamUrl, setStreamUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!teamA || !teamB || teamA === teamB) {
      toast.error("Pick two different teams.");
      return;
    }
    if (!date) {
      toast.error("Pick a date for the fixture.");
      return;
    }
    setBusy(true);
    try {
      await create({
        tournamentId,
        teamAId: teamA as Id<"teams">,
        teamBId: teamB as Id<"teams">,
        overs,
        venue: venue.trim() || undefined,
        stage,
        startTime: new Date(`${date}T${time || "18:00"}`).getTime(),
        streamUrl: streamUrl.trim() || undefined,
      });
      toast.success("Fixture scheduled.");
      setTeamA("");
      setTeamB("");
      setVenue("");
      setStreamUrl("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule the match.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border bg-card p-4 panel-glow">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Team A">
          <Select value={teamA} onValueChange={setTeamA}>
            <SelectTrigger className={inputCls}>
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent className="rounded-none border-border bg-card">
              {teams.map((t) => (
                <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Team B">
          <Select value={teamB} onValueChange={setTeamB}>
            <SelectTrigger className={inputCls}>
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent className="rounded-none border-border bg-card">
              {teams.filter((t) => t._id !== teamA).map((t) => (
                <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Overs per innings">
          <Input className={inputCls} type="number" min={1} max={50} value={overs} onChange={(e) => setOvers(Number(e.target.value) || 20)} />
        </Field>
        <Field label="Stage">
          <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
            <SelectTrigger className={inputCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none border-border bg-card">
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Venue">
          <Input className={inputCls} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="City ground" />
        </Field>
        <Field label="YouTube / Twitch stream URL (optional)">
          <Input className={inputCls} value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
        </Field>
        <Field label="Date">
          <Input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Start time">
          <Input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Button
        type="button"
        className="mt-3 w-full rounded-none bg-[#facc15] text-[10px] font-black uppercase tracking-widest text-[#422006] hover:bg-[#22c55e] hover:text-[#052e16]"
        onClick={submit}
        disabled={busy}
      >
        <CalendarPlus className="size-3.5" /> Schedule fixture
      </Button>
    </div>
  );
}

function FixtureList({
  matches,
}: {
  matches: {
    id: string;
    status: "UPCOMING" | "LIVE" | "COMPLETED";
    overs: number;
    stage?: string;
    startTime: number;
    streamUrl?: string;
    venue?: string;
    result?: string;
    teamA?: { name: string; shortCode: string; color: string } | null;
    teamB?: { name: string; shortCode: string; color: string } | null;
  }[];
}) {
  const setStatus = useMutation(api.matches.setStatus);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="divide-y divide-border/60 border border-border bg-card panel-glow">
      {matches.length === 0 && (
        <p className="px-3 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
          No fixtures scheduled for this tournament
        </p>
      )}
      {matches.map((m) => (
        <div key={m.id}>
          <div className="flex flex-wrap items-center gap-3 px-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <TeamMark shortCode={m.teamA?.shortCode ?? "—"} color={m.teamA?.color ?? "#334155"} size="sm" />
                <span className="truncate text-sm font-bold text-slate-100">{m.teamA?.name ?? "—"}</span>
                <span className="text-[10px] font-black uppercase text-slate-600">vs</span>
                <TeamMark shortCode={m.teamB?.shortCode ?? "—"} color={m.teamB?.color ?? "#334155"} size="sm" />
                <span className="truncate text-sm font-bold text-slate-100">{m.teamB?.name ?? "—"}</span>
              </div>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                {m.stage ?? "Match"} · {m.overs} overs · {formatDate(m.startTime)} {formatTime(m.startTime)}
                {m.streamUrl && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[#22d3ee]">
                    <Clapperboard className="size-3" /> stream set
                  </span>
                )}
              </p>
              {m.result && (
                <p className="mt-0.5 text-[11px] font-black uppercase tracking-wide text-[#22c55e]">{m.result}</p>
              )}
            </div>
            <StatusPill status={m.status} />
            <div className="flex items-center gap-2">
              <Link
                to={`/scorer/${m.id}`}
                className="inline-flex items-center gap-1 bg-[#ef4444] px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white transition-colors hover:bg-[#22c55e] hover:text-[#052e16]"
              >
                Score <ArrowRight className="size-3" />
              </Link>
              <button
                type="button"
                onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                className="inline-flex items-center gap-1 border border-border px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 hover:border-[#facc15] hover:text-[#facc15]"
              >
                <Pencil className="size-3" /> Edit
              </button>
              <StreamEditor matchId={m.id} streamUrl={m.streamUrl} />
              {m.status === "UPCOMING" && (
                <button
                  type="button"
                  className="border border-border px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 hover:border-[#ef4444] hover:text-[#ef4444]"
                  onClick={async () => {
                    try {
                      await setStatus({ matchId: m.id as Id<"matches">, status: "LIVE" });
                      toast.success("Match marked live.");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not update status.");
                    }
                  }}
                >
                  Go live
                </button>
              )}
            </div>
          </div>
          {editingId === m.id && (
            <MatchEditor match={m} onDone={() => setEditingId(null)} />
          )}
        </div>
      ))}
    </div>
  );
}

function MatchEditor({
  match,
  onDone,
}: {
  match: {
    id: string;
    status: "UPCOMING" | "LIVE" | "COMPLETED";
    overs: number;
    stage?: string;
    startTime: number;
    streamUrl?: string;
    venue?: string;
  };
  onDone: () => void;
}) {
  const update = useMutation(api.matches.update);
  const [overs, setOvers] = useState(match.overs);
  const [venue, setVenue] = useState(match.venue ?? "");
  const [stage, setStage] = useState<Stage>(
    (STAGES as readonly string[]).includes(match.stage ?? "")
      ? (match.stage as Stage)
      : "Group",
  );
  const [date, setDate] = useState(toDateInput(match.startTime));
  const [time, setTime] = useState(toTimeInput(match.startTime));
  const [streamUrl, setStreamUrl] = useState(match.streamUrl ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await update({
        matchId: match.id as Id<"matches">,
        overs,
        venue: venue.trim() || undefined,
        stage,
        startTime: new Date(`${date}T${time || "18:00"}`).getTime(),
        streamUrl: streamUrl.trim() || undefined,
      });
      toast.success("Fixture updated.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the fixture.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 border-t border-border bg-[#0b1524]/60 px-3 py-3 sm:grid-cols-4">
      <Field label="Overs per innings">
        <Input className={inputCls} type="number" min={1} max={50} value={overs} onChange={(e) => setOvers(Number(e.target.value) || 20)} />
      </Field>
      <Field label="Stage">
        <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
          <SelectTrigger className={inputCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none border-border bg-card">
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Venue">
        <Input className={inputCls} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="City ground" />
      </Field>
      <Field label="Date">
        <Input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Start time">
        <Input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </Field>
      <Field label="Stream URL" className="sm:col-span-2">
        <Input className={inputCls} value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
      </Field>
      <div className="flex items-end gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={save}
          className="h-10 rounded-none bg-[#facc15] px-3 text-[9px] font-black uppercase tracking-widest text-[#422006] hover:bg-[#22c55e] hover:text-[#052e16]"
        >
          Save fixture
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function toTimeInput(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function StreamEditor({ matchId, streamUrl }: { matchId: string; streamUrl?: string }) {
  const updateStream = useMutation(api.matches.updateStreamUrl);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(streamUrl ?? "");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setUrl(streamUrl ?? "");
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 border border-border px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 hover:border-[#22d3ee] hover:text-[#22d3ee]"
      >
        <Clapperboard className="size-3" /> Stream
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Input
        className="h-8 w-56 rounded-none border-border bg-[#0b1524] text-[10px] text-slate-200"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="YouTube / Twitch URL"
      />
      <Button
        type="button"
        disabled={busy}
        className="h-8 rounded-none bg-[#22d3ee] px-2 text-[9px] font-black uppercase tracking-widest text-[#083344] hover:bg-[#22c55e]"
        onClick={async () => {
          setBusy(true);
          try {
            await updateStream({ matchId: matchId as Id<"matches">, streamUrl: url.trim() });
            toast.success("Stream updated — viewers see it instantly.");
            setOpen(false);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not update the stream.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Save
      </Button>
    </span>
  );
}
