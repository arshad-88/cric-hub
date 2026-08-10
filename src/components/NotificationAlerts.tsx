// ---------------------------------------------------------------------------
// NotificationAlerts — mounted once at app root. Reactively watches the latest
// match events and surfaces new key moments (wickets, fifties, results, super
// overs) as in-app toasts and, when the tab is in the background and the user
// granted permission, OS-level browser notifications.
//
// Server-side pushes (for followers with the tab closed) are delivered by
// notificationsPush.sendPushForEvent — this component only handles the
// while-you're-here experience.
// ---------------------------------------------------------------------------

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { MatchEventType } from "@/convex/notifications";

/** Types chatty enough to skip the toast/browser alert. */
const QUIET: MatchEventType[] = ["live"];

export function NotificationAlerts() {
  const navigate = useNavigate();
  const events = useQuery(api.notifications.listRecent, { limit: 20 });
  const seen = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (events === undefined) return;

    // First payload = backlog; seed the seen-set without alerting.
    if (!initialized.current) {
      initialized.current = true;
      for (const e of events) seen.current.add(e.id);
      return;
    }

    for (const e of events) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      if (QUIET.includes(e.type)) continue;

      const open = () => navigate(`/matches/${e.matchId}`);
      toast(e.title, {
        description: `${e.matchLabel} — ${e.message}`,
        action: { label: "Open", onClick: open },
      });

      // OS-level notification only when the tab isn't in front (avoid
      // double-alerting what the toast already showed).
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        document.visibilityState === "hidden"
      ) {
        try {
          new Notification(`CrikHub · ${e.matchLabel}`, {
            body: `${e.title} — ${e.message}`,
            icon: "/logo.svg",
            tag: `crikhub-${e.id}`,
          });
        } catch {
          // some browsers throw for malformed options — toast already fired
        }
      }
    }
  }, [events, navigate]);

  return null;
}
