// web-push ships without TypeScript declarations; declare the minimal surface
// we use so `tsc` accepts the Node-runtime push actions.
declare module "web-push" {
  interface VapidKeys {
    publicKey: string;
    privateKey: string;
  }
  interface PushSubscription {
    endpoint: string;
    keys: { auth: string; p256dh: string };
  }
  export function generateVAPIDKeys(): VapidKeys;
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | null,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  const webpush: {
    generateVAPIDKeys: typeof generateVAPIDKeys;
    setVapidDetails: typeof setVapidDetails;
    sendNotification: typeof sendNotification;
  };
  export default webpush;
}
