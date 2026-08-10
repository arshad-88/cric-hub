/* CrikHub push service worker.
 * Receives web-push payloads from the Convex backend and shows system
 * notifications; tapping one opens the match center. */
const SW_VERSION = "crikhub-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge caches left by older service workers so a stale app shell can
      // never be served from disk — the page always loads from the network.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await clients.claim();
    })(),
  );
});

self.addEventListener("push", (event) => {
  let title = "CrikHub";
  let body = "Live match update";
  let url = "/";

  try {
    if (event.data) {
      const data = event.data.json();
      title = data.title || title;
      body = data.body || body;
      url = data.url || url;
    }
  } catch {
    // Fall back to the raw payload text if it wasn't JSON.
    body = event.data ? event.data.text() : body;
  }

  const options = {
    body,
    icon: "/logo.svg",
    badge: "/logo.svg",
    tag: url,
    data: { url },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) client.navigate(target);
          return;
        }
      }
      await clients.openWindow(target);
    })(),
  );
});
