// ---------------------------------------------------------------------------
// NotificationBell — the header alert bell. Shows a live feed of key match
// events (wickets, milestones, results, super overs) and lets visitors opt in
// to browser push notifications for the matches they follow.
// ---------------------------------------------------------------------------

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePushNotifications } from "@/hooks/use-notifications";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Bell, BellOff, BellRing, ChevronRight } from "lucide-react";
import type { MatchEventType } from "@/convex/notifications";

const EVENT_META: Record<
  MatchEventType,
  { label: string; className: string }
> = {
  wicket: { label: "WICKET", className: "bg-[#ef4444]/15 text-[#ef4444]" },
  milestone: { label: "MILESTONE", className: "bg-[#facc15]/15 text-[#facc15]" },
  team_milestone: { label: "TEAM", className: "bg-[#22d3ee]/15 text-[#22d3ee]" },
  live: { label: "LIVE", className: "bg-[#22c55e]/15 text-[#22c55e]" },
  innings: { label: "INNINGS", className: "bg-slate-500/15 text-slate-300" },
  result: { label: "RESULT", className: "bg-[#22c55e]/15 text-[#22c55e]" },
  tie: { label: "TIED", className: "bg-[#facc15]/15 text-[#facc15]" },
  superover: { label: "SUPER OVER", className: "bg-[#a78bfa]/15 text-[#a78bfa]" },
};

export function NotificationBell() {
  const navigate = useNavigate();
  const events = useQuery(api.notifications.listRecent, { limit: 30 });
  const { supported, enabled, enable, disable } = usePushNotifications();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(0);
  const seeded = useRef(false);

  // Count events that arrive while the bell is closed (unread badge).
  useEffect(() => {
    if (events === undefined) return;
    if (!seeded.current) {
      seeded.current = true;
      return; // don't badge the backlog
    }
    if (!open) setUnread((u) => u + events.length);
  }, [events, open]);

  const togglePush = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await disable();
        toast.success("Push notifications turned off.");
      } else {
        const error = await enable();
        if (error) {
          toast.error(error);
        } else {
          toast.success("Push notifications on — follow a match to get alerts!");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Match alerts"
          className="relative inline-flex size-8 items-center justify-center border border-border bg-card text-slate-300 transition-colors hover:border-[#22c55e] hover:text-white"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-black text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(92vw,22rem)] border-border bg-card p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="micro-label text-slate-400">Match alerts</span>
          {supported && (
            <button
              type="button"
              disabled={busy}
              onClick={togglePush}
              className={cn(
                "inline-flex items-center gap-1.5 border px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest transition-colors disabled:opacity-50",
                enabled
                  ? "border-[#22c55e] bg-[#052e16] text-[#22c55e]"
                  : "border-border bg-background text-slate-300 hover:border-[#22c55e] hover:text-[#22c55e]",
              )}
            >
              {enabled ? <BellRing className="size-3" /> : <BellOff className="size-3" />}
              {enabled ? "Pushes on" : "Enable push"}
            </button>
          )}
        </div>

        {events === undefined ? (
          <div className="space-y-2 px-3 py-6">
            <div className="h-3 animate-pulse bg-border" />
            <div className="h-3 w-2/3 animate-pulse bg-border" />
          </div>
        ) : events.length === 0 ? (
          <p className="px-3 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
            No key moments yet — follow a live match
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-border/60 overflow-y-auto">
            {events.map((e) => {
              const meta = EVENT_META[e.type];
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate(`/matches/${e.matchId}`);
                    }}
                    className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
                  >
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest",
                        meta?.className ?? "bg-border text-slate-300",
                      )}
                    >
                      {meta?.label ?? e.type}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-extrabold uppercase tracking-wide text-white">
                          {e.matchLabel}
                        </span>
                        <span className="shrink-0 text-[9px] font-medium text-slate-500">
                          {timeAgo(e.createdAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-slate-200">
                        {e.title}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {e.message}
                      </span>
                    </span>
                    <ChevronRight className="mt-1 size-3.5 shrink-0 text-slate-600" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
