// Notifications (system) and in-app alerts (tones, vibration, alarm loop).
//
// Two real channels exist for a web app, and both are exposed in Settings:
//  - in-app sound, synthesized with Web Audio (follows the phone's media volume);
//  - the system notification's own sound (follows the notification volume,
//    picked by the phone/browser — we can only turn it on or off via `silent`).
// A web app cannot use the phone's alarm channel; "strong" alerts instead
// repeat a louder tone and a longer vibration until the user taps the screen.
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
// `importance` decides whether this one counts as strong (alarm) or gentle.
export async function notify(title, body, tag, importance) {
  if (!state.settings.notifications || permission() !== 'granted') return false;
  const s = state.settings;
  const strong = isStrong(importance);
  const options = {
    body, tag,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    renotify: true,
    requireInteraction: strong, // an alarm should stay until dismissed
    silent: s.soundOutput === 'app' || !s.sound, // system sound only when asked for
    vibrate: s.vibrate ? vibrationPattern(strong) : undefined,
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

// ---- tones ------------------------------------------------------------------
// Each tone is a short motif: [frequency, offset s, duration s, waveform?].
// `sweep` tones glide between frequencies instead.
export const TONE_NAMES = ['chime', 'bell', 'marimba', 'pulse', 'siren'];
const TONES = {
  chime: { notes: [[880, 0, 0.16, 'sine'], [1175, 0.18, 0.28, 'sine']], vib: [80, 60, 80], span: 0.5 },
  bell: { notes: [[660, 0, 0.7, 'triangle'], [1320, 0, 0.35, 'sine', 0.35]], vib: [400], span: 0.8 },
  marimba: { notes: [[523, 0, 0.13, 'triangle'], [659, 0.15, 0.13, 'triangle'], [784, 0.3, 0.22, 'triangle']], vib: [60, 50, 60, 50, 120], span: 0.55 },
  pulse: { notes: [[440, 0, 0.08, 'square', 0.5], [440, 0.16, 0.08, 'square', 0.5], [440, 0.32, 0.08, 'square', 0.5]], vib: [80, 80, 80, 80, 80], span: 0.45 },
  siren: { sweep: [600, 900, 0.8], vib: [300, 100, 300], span: 0.85 },
};
// Small feedback sounds that are not user-configurable.
const FX = {
  done: [[523, 0, 0.08, 'sine'], [659, 0.08, 0.08, 'sine'], [784, 0.16, 0.14, 'sine']],
  miss: [[220, 0, 0.25, 'sine']],
};

export const PATTERN_NAMES = ['short', 'double', 'long', 'heartbeat', 'sos'];
const PATTERNS = {
  short: [80],
  double: [80, 60, 80],
  long: [400],
  heartbeat: [100, 80, 100, 300, 100, 80, 100],
  sos: [100, 60, 100, 60, 100, 200, 300, 60, 300, 60, 300, 200, 100, 60, 100, 60, 100],
};

function tone() { return TONES[state.settings.soundName] || TONES.chime; }

export function isStrong(importance) {
  const s = state.settings;
  return s.alertStyle === 'alarm' || (s.criticalAlarm && importance === 3);
}

// The vibration for a reminder: the tone's own pattern when synced, otherwise
// the user's choice. Strong alerts repeat it three times.
export function vibrationPattern(strong) {
  const s = state.settings;
  const base = s.vibSync ? tone().vib : (PATTERNS[s.vibPattern] || PATTERNS.double);
  if (!strong) return base;
  return [...base, 250, ...base, 250, ...base];
}

// ---- audio ------------------------------------------------------------------
let ctx = null;

// Call from a user gesture so audio is allowed later.
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no audio */ }
}

function volume(strong) {
  const v = Math.max(0.05, Math.min(1, (state.settings.volume || 70) / 100));
  return Math.min(0.9, v * 0.5 * (strong ? 1.8 : 1));
}

function playNotes(notes, gainMax) {
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  for (const [freq, at, dur, wave = 'sine', rel = 1] of notes) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(gainMax * rel, t0 + at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.03);
  }
}

function playSweep([from, to, dur], gainMax) {
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.linearRampToValueAtTime(to, t0 + dur / 2);
  osc.frequency.linearRampToValueAtTime(from, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(gainMax, t0 + 0.03);
  gain.gain.setValueAtTime(gainMax, t0 + dur - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// Plays the reminder tone once, at gentle or strong volume.
export function playTone(strong = false) {
  if (!state.settings.sound) return;
  const tn = tone();
  if (tn.sweep) playSweep(tn.sweep, volume(strong)); else playNotes(tn.notes, volume(strong));
}

export function vibrate(pattern) {
  if (!state.settings.vibrate || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch { /* ignore */ }
}

// ---- alarm loop ---------------------------------------------------------------
let alarmTimer = 0, alarmOn = false;

// Repeats tone + vibration for `alarmSeconds`, or until stopAlarm() (any tap).
export function startAlarm() {
  stopAlarm();
  alarmOn = true;
  const until = Date.now() + (state.settings.alarmSeconds || 15) * 1000;
  const period = Math.round((tone().span + 0.6) * 1000);
  const loop = () => {
    if (!alarmOn || Date.now() >= until) { stopAlarm(); return; }
    playTone(true);
    vibrate(vibrationPattern(true));
    alarmTimer = setTimeout(loop, period);
  };
  loop();
}

export function stopAlarm() {
  if (!alarmOn && !alarmTimer) return;
  alarmOn = false;
  clearTimeout(alarmTimer); alarmTimer = 0;
  if (navigator.vibrate) { try { navigator.vibrate(0); } catch { /* ignore */ } }
}

export function alarmRunning() { return alarmOn; }

// ---- feedback entry point -------------------------------------------------------
// kind: 'start' | 'warn' | 'miss' | 'done' | 'tap'. Reminders (start/warn) use
// the personalized tone and style; the rest are small fixed sounds.
export function feedback(kind, importance) {
  const s = state.settings;
  if (kind === 'start' || kind === 'warn') {
    if (isStrong(importance)) { startAlarm(); return; }
    vibrate(vibrationPattern(false));
    if (!document.hidden) playTone(false);
    return;
  }
  if (kind === 'miss') { vibrate([200]); if (s.sound && !document.hidden) playNotes(FX.miss, 0.15); return; }
  if (kind === 'done') { vibrate([30]); if (s.sound && !document.hidden) playNotes(FX.done, 0.15); return; }
  vibrate([10]);
}

// Previews for the settings screen.
export function testSound() { unlockAudio(); if (isStrong()) startAlarm(); else playTone(false); }
export function testVibration() { vibrate(vibrationPattern(isStrong())); }
