// Background reminders through Web Push, via the relay described in relay/.
// Entirely optional: without relay.config.js (see relay.config.example.js)
// `configured` is false and nothing here is ever shown or called.
//
// The phone's push service (FCM on Android, APNs on iPhone) wakes sw.js at the
// times the relay sends; sw.js shows the notification. The app only has to
// keep the relay's copy of the plan current: it re-uploads whenever the plan
// changes (done, snooze, edit, new day), with a hash to skip identical uploads.
import { state, save, uid } from './store.js';
import { buildPlan } from './plan.js';
import { idbGet, idbPut, idbDel } from './fsstore.js';

const cfg = (typeof self !== 'undefined' && self.MOMEN2M_RELAY) || null;
export const configured = !!(cfg && typeof cfg.url === 'string' && /^https:\/\//.test(cfg.url) && typeof cfg.publicKey === 'string' && cfg.publicKey.length > 40);
const RESYNC_EVERY = 6 * 3600000; // even with an unchanged plan, refresh "lastSync" so the relay knows we are alive

let reg = null;
export function setRegistration(r) { reg = r; if (state.push.enabled) setTimeout(() => sync(true).catch(() => {}), 500); }

export function supported() {
  return configured && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof PushManager !== 'undefined';
}

export function info() { return state.push; }

function serverKey() {
  const s = cfg.publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const base = () => cfg.url.replace(/\/+$/, '') + '/v1/device/' + encodeURIComponent(state.push.deviceId);

async function subscription(create) {
  if (!reg) reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey() });
  return sub;
}

// Lets sw.js re-register a rotated subscription on its own (pushsubscriptionchange).
async function shareWithWorker() {
  try { await idbPut('push', { url: cfg.url, deviceId: state.push.deviceId }); } catch { /* best-effort */ }
}

export async function enable() {
  if (!supported()) throw new Error('unsupported');
  if (Notification.permission !== 'granted') throw new Error('permission');
  if (!state.push.deviceId) state.push.deviceId = uid() + uid();
  await subscription(true);
  state.push.enabled = true;
  state.push.lastError = '';
  save();
  await shareWithWorker();
  return sync(true);
}

export async function disable() {
  state.push.enabled = false;
  save();
  try { await fetch(base(), { method: 'DELETE' }); } catch { /* relay unreachable: it goes quiet after a week anyway */ }
  try { const sub = await subscription(false); if (sub) await sub.unsubscribe(); } catch { /* ignore */ }
  try { await idbDel('push'); } catch { /* ignore */ }
}

// Simple string hash: enough to skip identical uploads.
function hashOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

let timer = 0;
let inflight = null;

// Debounced: many state changes in a row become one upload.
export function syncSoon(delay = 1500) {
  if (!state.push.enabled || !supported()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { sync().catch(() => {}); }, delay);
}

// Uploads the current plan. `force` skips the unchanged-plan shortcut.
// `keepalive` is for pagehide: the request survives the page going away.
export async function sync(force = false, keepalive = false) {
  if (!state.push.enabled || !supported()) return false;
  if (inflight) return inflight;
  inflight = (async () => {
    const now = Date.now();
    const plan = buildPlan(now);
    const hash = hashOf(JSON.stringify(plan));
    if (!force && hash === state.push.lastHash && now - state.push.lastSync < RESYNC_EVERY) return true;
    // Each step names itself so a failure on the phone can be told apart:
    // "subscribe: …" (browser/push service), "network" (relay unreachable, ad
    // blocker, offline), "relay 4xx/5xx" (relay refused).
    let sub;
    try { sub = await subscription(true); } catch (err) { throw new Error('subscribe: ' + (err && err.message || err)); }
    let res;
    try {
      res = await fetch(base(), {
        method: 'POST', keepalive,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), schedule: plan }),
      });
    } catch (err) { throw new Error('network: ' + (err && err.message || err)); }
    if (!res.ok) throw new Error('relay ' + res.status + ': ' + (await res.text().catch(() => '')).slice(0, 80));
    const data = await res.json().catch(() => ({}));
    state.push.lastSync = now;
    state.push.lastHash = hash;
    state.push.lastError = '';
    state.push.pending = data.pending || plan.length;
    save();
    return true;
  })().catch((err) => {
    state.push.lastError = String(err && err.message || err);
    save();
    return false;
  }).finally(() => { inflight = null; });
  return inflight;
}

export async function probe() {
  try {
    const r = await fetch(cfg.url.replace(/\/+$/, '') + '/v1/health');
    const j = await r.json();
    return !!(j && j.ok && j.configured);
  } catch { return false; }
}

// Known device-side reasons a push might not arrive, for the settings hint.
export function caveat() {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (ios && !standalone) return 'iosBrowser';
  return '';
}

export { idbGet };
