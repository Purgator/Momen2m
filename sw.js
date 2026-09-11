// Momen2m service worker: offline app shell + versioned cache + notification clicks.
// VERSION is bumped by tools/bump.js; a changed file is what triggers an update.
const VERSION = '1.4.0';
const CACHE = 'momen2m-' + VERSION;
// On localhost, always try the network first so developers see their edits immediately.
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './version.js',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/engine.js',
  './js/store.js',
  './js/time.js',
  './js/i18n.js',
  './js/emoji.js',
  './js/presets.js',
  './js/notify.js',
  './js/update.js',
  './js/fsstore.js',
  './js/autobackup.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/badge-96.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (DEV) {
    event.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});

// A tap on the notification focuses (or opens) the app. A tap on one of its
// action buttons (Done / Snooze) is forwarded to an open window, or carried
// in the URL when the app has to be opened first.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action || '';
  const key = (event.notification.data && event.notification.data.key) || '';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => 'focus' in c);
      if (win) {
        if (action && key) win.postMessage({ type: 'NOTIF_ACTION', action, key });
        return win.focus();
      }
      const url = action && key ? './?notif=' + encodeURIComponent(action) + '&key=' + encodeURIComponent(key) : './';
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
