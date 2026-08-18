const CACHE = "plu-timer-v8-start-fix";
const ASSETS = [
  "/apps/plu-timer/",
  "/apps/plu-timer/index.html",
  "/apps/plu-timer/manifest.webmanifest",
  "/apps/plu-timer/icon.svg"
];

const START_FIX = `<script>
(() => {
  // The timer's start() previously awaited Notification.requestPermission().
  // On Android/PWA that permission promise can delay or block the user action,
  // making "Mulai Timer" appear to do nothing. Keep the timer start path
  // synchronous while still requesting notification permission in the background.
  if (!('Notification' in window) || typeof Notification.requestPermission !== 'function') return;
  const nativeRequestPermission = Notification.requestPermission.bind(Notification);
  let requested = false;
  Notification.requestPermission = function () {
    if (!requested && Notification.permission === 'default') {
      requested = true;
      try {
        const p = nativeRequestPermission();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
    }
    return Promise.resolve(Notification.permission);
  };
})();
</script>`;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then(async response => {
        const type = response.headers.get("content-type") || "";
        if (!type.includes("text/html")) return response;
        const html = await response.text();
        const patched = html.replace(/<head>/i, match => `${match}${START_FIX}`);
        return new Response(patched, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }).catch(() => caches.match("/apps/plu-timer/").then(r => r || caches.match("/apps/plu-timer/index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
    for (const client of list) {
      if ('focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow('/apps/plu-timer/');
  }));
});
