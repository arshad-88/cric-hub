// ---------------------------------------------------------------------------
// notificationsPush.ts — web push delivery. This file runs in Convex's Node.js
// runtime ("use node") because web-push needs Node's crypto. Queries/mutations
// live in notifications.ts; only actions may live here.
// ---------------------------------------------------------------------------

"use node";

import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import webpush from "web-push";

/**
 * Returns the VAPID public key the browser needs to subscribe — generating
 * and persisting a keypair on first call. Nothing for the operator to set up.
 */
export const getVapidPublicKey = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const setting = await ctx.runQuery(internal.notifications.getSetting, { key: "vapid" });
    if (setting) {
      try {
        return (JSON.parse(setting.value) as { publicKey: string }).publicKey;
      } catch {
        // fall through and regenerate
      }
    }
    const keys = webpush.generateVAPIDKeys();
    await ctx.runMutation(internal.notifications.setSetting, {
      key: "vapid",
      value: JSON.stringify(keys),
    });
    return keys.publicKey;
  },
});

/** Deliver one recorded event to every follower's push subscription. */
export const sendPushForEvent = internalAction({
  args: { eventId: v.id("matchEvents") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.runQuery(internal.notifications.getEvent, { eventId });
    if (!event) return;
    const setting = await ctx.runQuery(internal.notifications.getSetting, { key: "vapid" });
    if (!setting) return;
    let vapid: { publicKey: string; privateKey: string };
    try {
      vapid = JSON.parse(setting.value);
    } catch {
      return;
    }
    if (!vapid.publicKey || !vapid.privateKey) return;

    const subs = await ctx.runQuery(internal.notifications.subsForMatch, {
      matchId: event.matchId,
    });
    if (subs.length === 0) return;

    webpush.setVapidDetails(
      "mailto:no-reply@crikhub.vercel.app",
      vapid.publicKey,
      vapid.privateKey,
    );
    const payload = JSON.stringify({
      title: event.title,
      body: event.message,
      url: `/matches/${event.matchId}`,
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
          payload,
        );
      } catch (err) {
        const code =
          err && typeof err === "object" && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        // 404/410 → the browser dropped the subscription; clean it up.
        if (code === 404 || code === 410) {
          await ctx.runMutation(internal.notifications.deleteSubscription, {
            endpoint: sub.endpoint,
          });
        }
      }
    }
  },
});
