// Imported by the generated service worker (vite.config.ts, workbox.importScripts).
// Shows push notifications from the server (worker/services/notify.ts) and opens the app on a tap.
// Every push shows a notification: iOS revokes a subscription that receives silent pushes.

self.addEventListener("push", (event) => {
  let msg = { title: "Tracker", body: "", url: "/", tag: undefined };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {
    // Not JSON: show the defaults.
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      data: { url: msg.url },
      icon: "/pwa-192x192.png",
      badge: "/pwa-64x64.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if ("focus" in w) {
          await w.focus();
          if ("navigate" in w) await w.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
