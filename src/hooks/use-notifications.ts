// ---------------------------------------------------------------------------
// use-notifications.ts — web push plumbing for CrikHub.
//
// enable() wires the whole chain: register /sw.js → ask for permission → fetch
// the self-bootstrapped VAPID public key from Convex → create the browser push
// subscription → store it server-side (notifications.subscribePush) so the
// backend can deliver wicket/milestone/result pushes to followers.
// ---------------------------------------------------------------------------

import { api } from "@/convex/_generated/api";
import { useAction, useMutation } from "convex/react";

const STORAGE_KEY = "crikhub-push-enabled";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isPushEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function setPushEnabled(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // ignore storage failures (private mode etc.)
  }
}

/** base64url → Uint8Array<ArrayBuffer> for applicationServerKey. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function base64Encode(bytes: ArrayBuffer | Uint8Array | null): string {
  if (!bytes) return "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of view) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function usePushNotifications() {
  const getVapidPublicKey = useAction(api.notificationsPush.getVapidPublicKey);
  const subscribePush = useMutation(api.notifications.subscribePush);
  const unsubscribePush = useMutation(api.notifications.unsubscribePush);

  async function register(): Promise<ServiceWorkerRegistration | null> {
    if (!pushSupported()) return null;
    return navigator.serviceWorker.register("/sw.js");
  }

  /** Ask for permission + subscribe; returns null on success or an error message. */
  async function enable(): Promise<string | null> {
    try {
      if (!pushSupported()) {
        return "Push notifications aren't supported by this browser.";
      }
      const registration = await register();
      if (!registration) {
        return "Could not register the notification worker.";
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return "Notifications are blocked in your browser settings.";
      }
      const publicKey = await getVapidPublicKey();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      await subscribePush({
        endpoint: subscription.endpoint,
        auth: base64Encode(subscription.getKey("auth")),
        p256dh: base64Encode(subscription.getKey("p256dh")),
      });
      setPushEnabled(true);
      return null;
    } catch (err) {
      return `Couldn't enable notifications — ${
        err instanceof Error ? err.message : "unknown error"
      }`;
    }
  }

  /** Unsubscribe from push and clear the stored subscription. */
  async function disable(): Promise<void> {
    try {
      if (pushSupported()) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await unsubscribePush({ endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
      }
    } catch {
      // never block the UI on cleanup
    }
    setPushEnabled(false);
  }

  return {
    supported: pushSupported(),
    enabled: isPushEnabled(),
    enable,
    disable,
  };
}
