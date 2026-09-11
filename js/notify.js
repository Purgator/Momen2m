// Notifications (system) and in-app feedback (vibration, short sounds).
import { state } from './store.js';

let swReg = null;
export function setRegistration(reg) { swReg = reg; }

export function permission() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  try {
    const r = await Notification.requestPermission();
    return r || Notification.permission;
  } catch {
    return Notification.permission;
  }
}

// Shows a system notification. Prefers the service worker (required on Android and iOS).
export async function notify(title, body, tag, data) {
  if (!state.settings.notifications || permission() !== 'granted') return false;
  const options = {
    body, tag, data,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    renotify: true,
    vibrate: state.settings.vibrate ? [120, 60, 120] : undefined,
  };
  try {
    if (swReg) { await swReg.showNotification(title, options); return true; }
  } catch { /* fall through */ }
  try { new Notification(title, options); return true; } catch { return false; }
}

// Closes a notification once its occurrence is handled.
export async function dismiss(tag) {
  try {
    if (!swReg) return;
    for (const n of await swReg.getNotifications({ tag })) n.close();
  } catch { /* ignore */ }
}

// ---- in-app feedback --------------------------------------------------------
const PATTERNS = { start: [80, 40, 80], warn: [50, 40, 50, 40, 50], done: [30], miss: [200], tap: [10] };
const TONES = {
  start: [[660, 0, 0.09], [880, 0.1, 0.12]],
  warn: [[740, 0, 0.06], [740, 0.09, 0.06], [740, 0.18, 0.06]],
  done: [[523, 0, 0.08], [659, 0.08, 0.08], [784, 0.16, 0.14]],
  miss: [[220, 0, 0.25]],
};
let ctx = null;

// Call from a user gesture so audio is allowed later.
export function unlockAudio() {
  if (!state.settings.sound) return;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no audio */ }
}

function beep(kind) {
  const seq = TONES[kind];
  if (!seq || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  for (const [freq, at, dur] of seq) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.02);
  }
}

export function feedback(kind) {
  if (state.settings.vibrate && navigator.vibrate) { try { navigator.vibrate(PATTERNS[kind] || 20); } catch { /* ignore */ } }
  if (state.settings.sound && !document.hidden) beep(kind);
}
