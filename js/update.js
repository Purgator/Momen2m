// Service worker registration and auto-update.
// A new version is fetched in the background; it is applied silently when the
// app goes to the background, or immediately when the user taps "Update".
import { setRegistration } from './notify.js';
import { setRegistration as setPushRegistration } from './push.js';

let reg = null;
let applying = false;
let onReadyCb = null;
let lastCheck = 0;
const CHECK_EVERY = 60 * 60 * 1000;

function announce(worker) {
  if (worker && onReadyCb) onReadyCb();
}

export function applyUpdate() {
  if (!reg || !reg.waiting) return false;
  applying = true;
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

export function hasUpdate() {
  return !!(reg && reg.waiting);
}

export async function checkForUpdate(force) {
  if (!reg) return false;
  const now = Date.now();
  if (!force && now - lastCheck < CHECK_EVERY) return hasUpdate();
  lastCheck = now;
  try { await reg.update(); } catch { /* offline */ }
  if (hasUpdate()) return true;
  const nw = reg.installing;
  if (!nw) return false;
  // A byte diff was found and the new worker is now installing (fetching and
  // caching assets), which can outlast reg.update() itself. Wait for it to
  // settle so the caller gets the real answer instead of a premature "no
  // update" a moment before the actual one arrives.
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); nw.removeEventListener('statechange', onChange); resolve(hasUpdate()); };
    const timer = setTimeout(done, 15000);
    function onChange() { if (nw.state === 'installed' || nw.state === 'redundant') done(); }
    nw.addEventListener('statechange', onChange);
  });
}

export function initUpdates(onReady) {
  onReadyCb = onReady;
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((r) => {
    reg = r;
    setRegistration(r);
    setPushRegistration(r);
    lastCheck = Date.now();
    if (r.waiting && navigator.serviceWorker.controller) announce(r.waiting);
    r.addEventListener('updatefound', () => {
      const nw = r.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) announce(nw);
      });
    });
  }).catch(() => { /* e.g. file:// or private mode */ });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) location.reload();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Nobody is looking: apply a pending update now.
      if (hasUpdate()) applyUpdate();
    } else {
      checkForUpdate(false);
    }
  });
}
