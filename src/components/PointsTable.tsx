import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TeamMark } from "@/components/swiss";
import type { PointsRow } from "@/lib/format";
import { cn } from "@/lib/utils";
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
import { toast } from "sonner";
import { Pencil, RotateCcw } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

export function PointsTable({
  rows,
  isOrganizer = false,
  tournamentId,
}: {
  rows: PointsRow[];
  isOrganizer?: boolean;
  tournamentId?: string;
}) {
  const [editRow, setEditRow] = useState<PointsRow | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const saveOverride = useMutation(api.leaderboard.savePointsOverride);
  const clearOverrides = useMutation(api.leaderboard.clearPointsOverrides);

  if (rows.length === 0) {
    return (
      <p className="border border-border bg-card px-4 py-8 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
        No completed matches yet
      </p>
    );
  }
  return (
    <div className="border border-border bg-card panel-glow">
      <div className="grid grid-cols-[1fr_repeat(6,minmax(0,auto))] items-center gap-x-3 border-b border-border bg-panel px-3 py-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Team</span>
        {["P", "W", "L", "T", "NRR", "Pts"].map((h) => (
          <span
            key={h}
            className="score-nums w-8 text-right text-[9px] font-bold uppercase tracking-widest text-slate-400"
          >
            {h}
          </span>
        ))}
      </div>
      <ul>
        {rows.map((r, i) => (
          <li
            key={r.team._id}
            className={cn(
              "grid grid-cols-[1fr_repeat(6,minmax(0,auto))] items-center gap-x-3 border-b border-border/60 px-3 py-2 last:border-0",
              i === 0 && "bg-[#22c55e]/[0.06]",
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="score-nums w-4 text-[10px] font-extrabold text-slate-500">
                {i + 1}
              </span>
              <TeamMark shortCode={r.team.shortCode} color={r.team.color} size="sm" />
              <span className="truncate text-sm font-bold text-slate-100">{r.team.name}</span>
              {isOrganizer && (
                <button
                  type="button"
                  onClick={() => setEditRow(r)}
                  className="ml-1 text-slate-500 hover:text-[#22d3ee]"
                  title="Edit points"
                >
                  <Pencil className="size-3" />
                </button>
              )}
            </span>
            <span className="score-nums w-8 text-right text-xs font-semibold text-slate-300">{r.played}</span>
            <span className="score-nums w-8 text-right text-xs font-semibold text-[#22c55e]">{r.won}</span>
            <span className="score-nums w-8 text-right text-xs font-semibold text-slate-400">{r.lost}</span>
            <span className="score-nums w-8 text-right text-xs font-semibold text-slate-400">{r.tied}</span>
            <span className="score-nums w-8 text-right text-xs font-semibold text-slate-500">
              {r.nrr.toFixed(3)}
            </span>
            <span
              className={cn(
                "score-nums w-8 text-right text-sm font-extrabold",
                i < 2 ? "text-[#facc15] led-gold" : "text-slate-100",
              )}
            >
              {r.points}
            </span>
          </li>
        ))}
      </ul>
      {isOrganizer && (
        <div className="border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={() => setClearOpen(true)}
            className="text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-[#facc15]"
          >
            <RotateCcw className="mr-1 inline size-3" /> Clear all edits
          </button>
        </div>
      )}

      {/* Edit dialog */}
      {editRow && tournamentId && (
        <PointsEditDialog
          row={editRow}
          tournamentId={tournamentId}
          onCancel={() => setEditRow(null)}
          onSaved={() => setEditRow(null)}
        />
      )}

      {/* Clear all overrides confirmation */}
      {clearOpen && tournamentId && (
        <Dialog open onOpenChange={(o) => !o && setClearOpen(false)}>
          <DialogContent className="rounded-none border-border sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="uppercase text-white">Clear all edits?</DialogTitle>
              <DialogDescription>
                This will revert all manually edited points back to the
                auto-computed values from match results.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" className="rounded-none border-border uppercase text-slate-300" onClick={() => setClearOpen(false)}>Cancel</Button>
              <Button
                className="rounded-none bg-[#facc15] uppercase text-[#422006]"
                onClick={async () => {
                  try {
                    await clearOverrides({ tournamentId: tournamentId as Id<"tournaments"> });
                    toast.success("All edits cleared.");
                    setClearOpen(false);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not clear.");
                  }
                }}
              >
                Clear all
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PointsEditDialog({
  row,
  tournamentId,
  onCancel,
  onSaved,
}: {
  row: PointsRow;
  tournamentId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const saveOverride = useMutation(api.leaderboard.savePointsOverride);
  const [played, setPlayed] = useState(String(row.played));
  const [won, setWon] = useState(String(row.won));
  const [lost, setLost] = useState(String(row.lost));
  const [tied, setTied] = useState(String(row.tied));
  const [points, setPoints] = useState(String(row.points));
  const [nrr, setNrr] = useState(String(row.nrr.toFixed(3)));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await saveOverride({
        tournamentId: tournamentId as Id<"tournaments">,
        teamId: row.team._id as Id<"teams">,
        played: Number(played),
        won: Number(won),
        lost: Number(lost),
        tied: Number(tied),
        points: Number(points),
        nrr: parseFloat(nrr) || 0,
      });
      toast.success(`${row.team.name} updated.`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="rounded-none border-border sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="uppercase text-white">
            Edit {row.team.name}
          </DialogTitle>
          <DialogDescription>
            Override the computed values. Leave as-is to keep auto-calculated
            numbers.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 py-2">
          <div>
            <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Played</Label>
            <Input className="mt-1 rounded-none border-border bg-panel text-slate-200" type="number" min={0} value={played} onChange={(e) => setPlayed(e.target.value)} />
          </div>
          <div>
            <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Won</Label>
            <Input className="mt-1 rounded-none border-border bg-panel text-slate-200" type="number" min={0} value={won} onChange={(e) => setWon(e.target.value)} />
          </div>
          <div>
            <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Lost</Label>
            <Input className="mt-1 rounded-none border-border bg-panel text-slate-200" type="number" min={0} value={lost} onChange={(e) => setLost(e.target.value)} />
          </div>
          <div>
            <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Tied</Label>
            <Input className="mt-1 rounded-none border-border bg-panel text-slate-200" type="number" min={0} value={tied} onChange={(e) => setTied(e.target.value)} />
          </div>
          <div>
            <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Points</Label>
            <Input className="mt-1 rounded-none border-border bg-panel text-slate-200" type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} />
          </div>
          <div>
            <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">NRR</Label>
            <Input className="mt-1 rounded-none border-border bg-panel text-slate-200" type="number" step={0.001} value={nrr} onChange={(e) => setNrr(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none border-border uppercase text-slate-300" onClick={onCancel}>Cancel</Button>
          <Button className="rounded-none bg-[#22c55e] uppercase text-[#052e16]" onClick={submit} disabled={busy}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
