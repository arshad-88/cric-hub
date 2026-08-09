import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { MicroLabel, SectionHeading, StatusPill, TeamMark } from "@/components/swiss";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/vpl";
import {
  ArrowRight,
  LayoutDashboard,
  LogOut,
  PencilRuler,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

type Tab = "matches" | "teams" | "players";

const STAGES = ["Group", "Quarter-final", "Semi-final", "Final"] as const;

type TeamDoc = {
  _id: string;
  tournamentId: string;
  name: string;
  shortCode: string;
  color: string;
};

type TeamLiteDoc = { _id: string; name: string; shortCode: string; color: string };

type MatchRowLite = {
  id: string;
  status: "UPCOMING" | "LIVE" | "COMPLETED";
  overs: number;
  venue?: string | null;
  stage?: string | null;
  startTime: number;
  streamUrl?: string | null;
  result?: string | null;
  inningsSummary?: string | null;
  teamA?: TeamLiteDoc | null;
  teamB?: TeamLiteDoc | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-bold uppercase tracking-widest text-foreground/60">
        {label}
      </Label>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const stats = useQuery(api.admin.adminStats);
  const tournament = useQuery(api.tournaments.getActive);
  const teams = useQuery(api.teams.listActive);
  const matches = useQuery(api.matches.list, {});
  const grantAdmin = useMutation(api.admin.grantAdmin);
  const [tab, setTab] = useState<Tab>("matches");
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleClaimAdmin = async () => {
    setBusy(true);
    try {
      await grantAdmin();
      toast.success("Scorer role granted — welcome to the scorers' box.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not claim the role.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* admin top bar */}
      <div className="border-b border-foreground bg-foreground text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <LayoutDashboard className="size-4 text-[#E4002B]" />
            <span className="text-sm font-extrabold uppercase tracking-tight">
              VPL Scorers' Console
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-[10px] font-bold uppercase tracking-widest text-white/60 hover:text-white"
            >
              Public site
            </Link>
            <span className="hidden text-[10px] font-bold uppercase tracking-widest text-white/50 sm:inline">
              {user?.email ?? user?.name ?? "Scorer"}
            </span>
            <Button
              type="button"
              variant="ghost"
              className="h-8 gap-1.5 rounded-none bg-white/10 px-3 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white hover:text-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="size-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* admin role gate */}
        {stats !== undefined && !stats.isAdmin && (
          <div className="mb-8 border-2 border-[#E4002B] bg-white p-5">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <MicroLabel className="text-[#E4002B]">Scorer role required</MicroLabel>
                <p className="mt-1 text-sm text-foreground/70">
                  {stats.hasAnyAdmin
                    ? "An admin already exists — ask them to promote your account."
                    : "You're first here. Claim the scorer role to set up matches, teams and score live."}
                </p>
              </div>
              {!stats.hasAnyAdmin && (
                <Button
                  type="button"
                  onClick={handleClaimAdmin}
                  disabled={busy}
                  className="rounded-none bg-[#E4002B] uppercase text-white hover:bg-foreground"
                >
                  <ShieldCheck className="size-4" /> Claim scorer role
                </Button>
              )}
            </div>
          </div>
        )}

        {/* stats */}
        <div className="grid grid-cols-2 gap-px border border-foreground bg-foreground sm:grid-cols-5">
          {[
            { label: "Teams", value: stats?.counts.teams ?? "—" },
            { label: "Players", value: stats?.counts.players ?? "—" },
            { label: "Upcoming", value: stats?.counts.upcoming ?? "—" },
            { label: "Live", value: stats?.counts.live ?? "—" },
            { label: "Completed", value: stats?.counts.completed ?? "—" },
          ].map((s) => (
            <div key={s.label} className="bg-white px-4 py-4 text-center">
              <p className="score-nums text-2xl font-extrabold">{s.value}</p>
              <MicroLabel className="text-foreground/50">{s.label}</MicroLabel>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div className="mt-8 flex items-center gap-2 border-b-2 border-foreground pb-3">
          {(
            [
              { key: "matches", label: "Matches", icon: <PencilRuler className="size-3.5" /> },
              { key: "teams", label: "Teams", icon: <Users className="size-3.5" /> },
              { key: "players", label: "Players", icon: <Users className="size-3.5" /> },
            ] as { key: Tab; label: string; icon: React.ReactNode }[]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest",
                tab === t.key
                  ? "bg-foreground text-white"
                  : "text-foreground/55 hover:text-foreground",
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "matches" && <MatchesTab teams={teams ?? []} matches={matches ?? []} />}
          {tab === "teams" && <TeamsTab teams={teams ?? []} />}
          {tab === "players" && <PlayersTab teams={teams ?? []} />}
        </div>

        {!tournament && (
          <div className="mt-8 border border-foreground bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-foreground/60">
              No active tournament — run the seed (see README) or create teams &amp; fixtures once
              a tournament exists.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// ===================== MATCHES TAB =====================

function MatchesTab({ teams, matches }: { teams: TeamDoc[]; matches: MatchRowLite[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [startMatchId, setStartMatchId] = useState<string | null>(null);
  const [streamMatchId, setStreamMatchId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeading index="A" title="Fixtures" className="flex-1" />
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-none bg-foreground uppercase text-white hover:bg-[#E4002B]"
        >
          <Plus className="size-4" /> New match
        </Button>
      </div>

      {matches.length === 0 ? (
        <p className="border border-foreground bg-white px-4 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-foreground/40">
          No fixtures yet
        </p>
      ) : (
        <ul className="divide-y divide-foreground/10 border border-foreground bg-white">
          {matches.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <StatusPill status={m.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {m.teamA?.name ?? "TBD"} <span className="text-foreground/40">vs</span>{" "}
                  {m.teamB?.name ?? "TBD"}
                </p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-foreground/50">
                  {m.stage ?? "Match"} · {formatDate(m.startTime)} · {m.overs} overs
                  {m.venue ? ` · ${m.venue}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {m.status === "UPCOMING" && (
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-none bg-[#E4002B] text-[10px] font-bold uppercase text-white hover:bg-foreground"
                    onClick={() => setStartMatchId(m.id)}
                  >
                    Toss &amp; start <ArrowRight className="size-3.5" />
                  </Button>
                )}
                {m.status === "LIVE" && (
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-none bg-foreground text-[10px] font-bold uppercase text-white hover:bg-[#E4002B]"
                    onClick={() => navigate(`/scorer/${m.id}`)}
                  >
                    Scorer panel
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none text-[10px] font-bold uppercase"
                  onClick={() => setStreamMatchId(m.id)}
                >
                  Stream
                </Button>
                <Button asChild type="button" size="sm" variant="ghost" className="rounded-none text-[10px] font-bold uppercase">
                  <Link to={`/matches/${m.id}`}>View</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <CreateMatchDialog teams={teams} onClose={() => setOpen(false)} />
      )}
      {startMatchId && (
        <StartMatchDialog matchId={startMatchId} onClose={() => setStartMatchId(null)} />
      )}
      {streamMatchId && (
        <StreamDialog matchId={streamMatchId} onClose={() => setStreamMatchId(null)} />
      )}
    </div>
  );
}

function CreateMatchDialog({
  teams,
  onClose,
}: {
  teams: TeamDoc[];
  onClose: () => void;
}) {
  const create = useMutation(api.matches.create);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [overs, setOvers] = useState("20");
  const [venue, setVenue] = useState("");
  const [stage, setStage] = useState<string>("Group");
  const [startTime, setStartTime] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!teamA || !teamB || teamA === teamB) {
      toast.error("Pick two different teams.");
      return;
    }
    setBusy(true);
    try {
      await create({
        teamAId: teamA,
        teamBId: teamB,
        overs: Math.max(1, Number(overs) || 20),
        venue: venue || undefined,
        stage: stage as (typeof STAGES)[number],
        startTime: startTime ? new Date(startTime).getTime() : Date.now(),
        streamUrl: streamUrl || undefined,
      });
      toast.success("Fixture created.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the fixture.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="uppercase">New fixture</DialogTitle>
          <DialogDescription>Set up a match for the active tournament.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Team A">
              <Select value={teamA} onValueChange={setTeamA}>
                <SelectTrigger className="rounded-none"><SelectValue placeholder="Team A" /></SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Team B">
              <Select value={teamB} onValueChange={setTeamB}>
                <SelectTrigger className="rounded-none"><SelectValue placeholder="Team B" /></SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Overs">
              <Input className="rounded-none" value={overs} onChange={(e) => setOvers(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Stage">
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Start">
              <Input
                className="rounded-none"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Venue">
            <Input className="rounded-none" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Vasavi Ground, Peddapalli" />
          </Field>
          <Field label="Stream URL (YouTube / Twitch)">
            <Input className="rounded-none" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none uppercase" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="rounded-none bg-[#E4002B] uppercase text-white hover:bg-foreground" onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create fixture"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Toss + opening pair + first bowler, then jump into the scorer. */
function StartMatchDialog({
  matchId,
  onClose,
}: {
  matchId: string;
  onClose: () => void;
}) {
  const scorecard = useQuery(api.scorecard.get, { matchId });
  const setToss = useMutation(api.matches.setToss);
  const startInnings = useMutation(api.scoring.startInnings);
  const teams = useQuery(api.teams.listActive);
  const navigate = useNavigate();

  const [tossWinner, setTossWinner] = useState<string>("");
  const [tossDecision, setTossDecision] = useState<"bat" | "bowl">("bat");
  const [striker, setStriker] = useState("");
  const [nonStriker, setNonStriker] = useState("");
  const [bowler, setBowler] = useState("");
  const [busy, setBusy] = useState(false);

  // derived (pure) — safe to compute before any early return
  const battingTeamId =
    tossWinner && tossDecision === "bat"
      ? tossWinner
      : tossWinner
        ? scorecard?.teamA?.id === tossWinner
          ? scorecard.teamB.id
          : scorecard.teamA.id
        : "";
  const bowlingTeamId = battingTeamId
    ? battingTeamId === scorecard?.teamA?.id
      ? scorecard?.teamB?.id ?? ""
      : scorecard?.teamA?.id ?? ""
    : "";

  // hooks always run — args are skipped until the teams resolve
  const battingSquad = useQuery(
    api.players.listByTeam,
    battingTeamId ? { teamId: battingTeamId } : "skip",
  );
  const bowlingSquad = useQuery(
    api.players.listByTeam,
    bowlingTeamId ? { teamId: bowlingTeamId } : "skip",
  );

  if (!scorecard || !teams) return null;

  const submit = async () => {
    if (!tossWinner || !battingTeamId || !striker || !nonStriker || !bowler) {
      toast.error("Fill the toss, the opening pair and the first bowler.");
      return;
    }
    setBusy(true);
    try {
      await setToss({ matchId, tossWinnerId: tossWinner, tossDecision });
      await startInnings({
        matchId,
        battingTeamId,
        bowlingTeamId,
        strikerId: striker,
        nonStrikerId: nonStriker,
        bowlerId: bowler,
      });
      toast.success("Match is live — scoring!");
      navigate(`/scorer/${matchId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the match.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="uppercase">Toss &amp; start innings</DialogTitle>
          <DialogDescription>
            {scorecard.teamA.name} vs {scorecard.teamB.name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Toss winner">
              <Select value={tossWinner} onValueChange={setTossWinner}>
                <SelectTrigger className="rounded-none"><SelectValue placeholder="Winner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={scorecard.teamA.id}>{scorecard.teamA.name}</SelectItem>
                  <SelectItem value={scorecard.teamB.id}>{scorecard.teamB.name}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Decision">
              <Select value={tossDecision} onValueChange={(v) => setTossDecision(v as "bat" | "bowl")}>
                <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bat">Bat first</SelectItem>
                  <SelectItem value="bowl">Bowl first</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {battingTeamId && (
            <>
              <div className="border border-foreground bg-muted/50 px-3 py-2 text-[11px] font-bold uppercase tracking-wider">
                {scorecard.teamA.id === battingTeamId ? scorecard.teamA.name : scorecard.teamB.name}{" "}
                to bat · {bowlingTeamId === scorecard.teamA.id ? scorecard.teamA.name : scorecard.teamB.name} to bowl
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Opening striker">
                  <Select value={striker} onValueChange={setStriker}>
                    <SelectTrigger className="rounded-none"><SelectValue placeholder="Striker" /></SelectTrigger>
                    <SelectContent>
                      {(battingSquad ?? []).map((p) => (
                        <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Non-striker">
                  <Select value={nonStriker} onValueChange={setNonStriker}>
                    <SelectTrigger className="rounded-none"><SelectValue placeholder="Non-striker" /></SelectTrigger>
                    <SelectContent>
                      {(battingSquad ?? []).map((p) => (
                        <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="First bowler">
                <Select value={bowler} onValueChange={setBowler}>
                  <SelectTrigger className="rounded-none"><SelectValue placeholder="Bowler" /></SelectTrigger>
                  <SelectContent>
                    {(bowlingSquad ?? []).map((p) => (
                      <SelectItem key={p._id} value={p._id}>{p.name} · {p.role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none uppercase" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="rounded-none bg-[#E4002B] uppercase text-white hover:bg-foreground"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Starting…" : "Start match & score"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StreamDialog({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const scorecard = useQuery(api.scorecard.get, { matchId });
  const update = useMutation(api.matches.updateStreamUrl);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  if (!scorecard) return null;

  const save = async () => {
    setBusy(true);
    try {
      await update({ matchId, streamUrl: url.trim() });
      toast.success("Stream link updated.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the stream.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-none sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="uppercase">Live stream</DialogTitle>
          <DialogDescription>
            Paste a YouTube video ID/URL or a Twitch channel URL. Current:{" "}
            {scorecard.match.streamUrl ?? "none"}
          </DialogDescription>
        </DialogHeader>
        <Input
          className="rounded-none"
          defaultValue={scorecard.match.streamUrl ?? ""}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
        />
        <DialogFooter>
          <Button variant="outline" className="rounded-none uppercase" onClick={onClose}>
            Cancel
          </Button>
          <Button className="rounded-none bg-[#E4002B] uppercase text-white hover:bg-foreground" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save stream"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== TEAMS TAB =====================

function TeamsTab({ teams }: { teams: TeamDoc[] }) {
  const create = useMutation(api.teams.create);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("#E4002B");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !code.trim()) {
      toast.error("Name and short code are required.");
      return;
    }
    setBusy(true);
    try {
      await create({ name: name.trim(), shortCode: code.trim(), color });
      toast.success("Team added.");
      setName("");
      setCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the team.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <div className="border border-foreground bg-white p-5">
        <MicroLabel className="mb-4">Add a team</MicroLabel>
        <div className="space-y-4">
          <Field label="Team name">
            <Input className="rounded-none" value={name} onChange={(e) => setName(e.target.value)} placeholder="Krishna Kings" />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Short code">
              <Input className="rounded-none uppercase" maxLength={4} value={code} onChange={(e) => setCode(e.target.value)} placeholder="KK" />
            </Field>
            <Field label="Identity">
              <div className="flex items-center gap-2 border border-input bg-white px-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer border-0 bg-transparent p-0"
                />
                <span className="score-nums text-[10px] font-bold uppercase">{color}</span>
              </div>
            </Field>
          </div>
          <Button
            type="button"
            onClick={submit}
            disabled={busy}
            className="w-full rounded-none bg-foreground uppercase text-white hover:bg-[#E4002B]"
          >
            <Plus className="size-4" /> Add team
          </Button>
        </div>
      </div>

      <div>
        <MicroLabel className="mb-3">Teams ({teams.length})</MicroLabel>
        <ul className="divide-y divide-foreground/10 border border-foreground bg-white">
          {teams.map((t) => (
            <li key={t._id} className="flex items-center gap-3 px-4 py-3">
              <TeamMark shortCode={t.shortCode} color={t.color} />
              <span className="flex-1 truncate text-sm font-bold">{t.name}</span>
              <span className="score-nums text-[10px] font-bold uppercase text-foreground/50">
                {t.shortCode}
              </span>
            </li>
          ))}
          {teams.length === 0 && (
            <li className="px-4 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-foreground/40">
              No teams yet — add your first squad
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

// ===================== PLAYERS TAB =====================

function PlayersTab({ teams }: { teams: TeamDoc[] }) {
  const [teamId, setTeamId] = useState<string>("");
  const squad = useQuery(api.players.listByTeam, teamId ? { teamId } : "skip");
  const create = useMutation(api.players.create);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"Batsman" | "Bowler" | "All-rounder">("Batsman");
  const [busy, setBusy] = useState(false);

  const selectedTeam = teams.find((t) => t._id === teamId);

  const submit = async () => {
    if (!teamId || !name.trim()) {
      toast.error("Pick a team and enter a name.");
      return;
    }
    setBusy(true);
    try {
      await create({ teamId, name: name.trim(), role });
      toast.success("Player added to the squad.");
      setName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the player.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <div className="border border-foreground bg-white p-5">
        <MicroLabel className="mb-4">Add a player</MicroLabel>
        <div className="space-y-4">
          <Field label="Team">
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="rounded-none">
                <SelectValue placeholder="Select squad" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Player name">
            <Input className="rounded-none" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ravi Kumar" />
          </Field>
          <Field label="Role">
            <div className="grid grid-cols-3 gap-2">
              {(["Batsman", "Bowler", "All-rounder"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "border px-2 py-2 text-[10px] font-bold uppercase tracking-wider",
                    role === r ? "border-foreground bg-foreground text-white" : "border-foreground bg-white text-foreground/60",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </Field>
          <Button
            type="button"
            onClick={submit}
            disabled={busy}
            className="w-full rounded-none bg-foreground uppercase text-white hover:bg-[#E4002B]"
          >
            <Plus className="size-4" /> Add player
          </Button>
        </div>
      </div>

      <div>
        <MicroLabel className="mb-3">
          {selectedTeam ? `${selectedTeam.name} — squad (${squad?.length ?? 0})` : "Squad roster"}
        </MicroLabel>
        {!selectedTeam ? (
          <p className="border border-foreground bg-white px-4 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-foreground/40">
            Select a team to view its roster
          </p>
        ) : (
          <ul className="divide-y divide-foreground/10 border border-foreground bg-white">
            {(squad ?? []).map((p) => (
              <li key={p._id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="truncate text-sm font-bold">{p.name}</span>
                <span className="bg-foreground px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-white">
                  {p.role}
                </span>
              </li>
            ))}
            {(squad ?? []).length === 0 && (
              <li className="px-4 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-foreground/40">
                Empty squad — add players
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
