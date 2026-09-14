// Momen2m service worker: offline app shell + versioned cache + notification clicks.
// VERSION is bumped by tools/bump.js; a changed file is what triggers an update.
const VERSION = '1.8.0';
// Optional push relay settings (relay.config.js is deployment-specific and may be empty/missing).
try { importScripts('relay.config.js'); } catch { /* no relay for this copy */ }
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
  './js/plan.js',
  './js/push.js',
  './relay.config.js',
  './js/diff.js',
  './js/game.js',
  './js/share.js',
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

// ---- background reminders (Web Push via the relay in relay/) ----------------------
// The relay sends the exact notification the app would have shown. If the app is
// on screen right now it will show it itself, so only tell it to refresh.
self.addEventListener('push', (event) => {
  let p = null;
  try { p = event.data ? event.data.json() : null; } catch { p = null; }
  if (!p || !p.title) return;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = wins.some((c) => c.visibilityState === 'visible');
    for (const c of wins) c.postMessage({ type: 'PUSH', key: p.key || p.tag || '' });
    if (visible) return;
    const options = {
      body: p.body || '', tag: p.tag || undefined, data: { key: p.key || p.tag || '' },
      icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', timestamp: Date.now(), renotify: true,
      requireInteraction: !!p.strong, silent: !!p.silent,
    };
    if (!p.silent && Array.isArray(p.vibrate) && p.vibrate.length) options.vibrate = p.vibrate;
    if (Array.isArray(p.actions) && p.actions.length) options.actions = p.actions;
    await self.registration.showNotification(p.title, options);
  })());
});

// The push service rotated our subscription: tell the relay, keep the plan.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const cfg = self.MOMEN2M_RELAY;
    if (!cfg || !cfg.url) return;
    const info = await idbGet('momen2m-fs', 'handles', 'push').catch(() => null);
    if (!info || !info.deviceId) return;
    const sub = (event.newSubscription) || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(cfg.publicKey) });
    await fetch(cfg.url.replace(/\/+$/, '') + '/v1/device/' + encodeURIComponent(info.deviceId) + '/subscription', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }),
    });
  })());
});

function b64uToBytes(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function idbGet(dbName, store, key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(store);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const get = db.transaction(store, 'readonly').objectStore(store).get(key);
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => reject(get.error);
    };
  });
}
