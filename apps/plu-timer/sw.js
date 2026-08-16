const CACHE = "plu-timer-v4-ric-space";
const ASSETS = [
  "/apps/plu-timer/",
  "/apps/plu-timer/index.html",
  "/apps/plu-timer/manifest.webmanifest",
  "/apps/plu-timer/icon.svg",
  "/apps/plu-timer/alarm.mp3"
];

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
      fetch(req).catch(() => caches.match("/apps/plu-timer/").then(r => r || caches.match("/apps/plu-timer/index.html")))
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
