// Persistent state in localStorage. Small, synchronous, survives offline.
import { detectLang } from './i18n.js';

const KEY = 'momen2m.v1';
const RECOVERY_KEY = 'momen2m.v1.recovery';

function defaults() {
  return {
    v: 1,
    lang: detectLang(),
    onboarded: false,
    settings: {
      notifications: true,
      reminderBefore: 5,   // minutes before the deadline
      sound: true,
      vibrate: true,
      // Alerts: how a reminder sounds and feels.
      alertStyle: 'gentle',   // 'gentle' (like a notification) | 'alarm' (repeats until tapped)
      criticalAlarm: true,    // critical moments always use the strong style
      soundName: 'chime',     // see TONE_NAMES in notify.js
      volume: 70,             // 10..100
      soundOutput: 'app',     // 'app' (media volume) | 'system' (notification sound) | 'both'
      alarmSeconds: 15,       // how long a strong alert repeats
      vibSync: true,          // vibration follows the tone
      vibPattern: 'double',   // used when vibSync is off; kept even while it is on
      snoozeAllowed: true,
      snoozeMinutes: 10,
      maxSnoozes: 2,
    },
    habits: [],
    days: {},               // dayKey -> occKey -> record
    game: { xp: 0, streak: 0, bestStreak: 0, lastEvaluated: null, done: 0, missed: 0 },
    lastSeen: Date.now(),
    habitsVersion: 0,        // bumped on every habit add/edit/delete/toggle
    backedUpAtVersion: -1,   // habitsVersion at the moment of the last successful backup
    lastBackupAt: 0,         // ms epoch of the last successful export, 0 = never
    backupFolder: '',        // name of the remembered backup folder (handle lives in IndexedDB)
  };
}

// Fills in anything missing from a raw (loaded, imported or restored) blob with
// defaults, so an older backup or a partial file never crashes the app.
function mergeWithDefaults(raw) {
  const d = defaults();
  return {
    ...d, ...raw,
    settings: { ...d.settings, ...(raw.settings || {}) },
    game: { ...d.game, ...(raw.game || {}) },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return mergeWithDefaults(JSON.parse(raw));
  } catch {
    return defaults();
  }
}

export let state = load();

let timer = 0;
function flush() {
  timer = 0;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
}
export function save() {
  if (!timer) timer = setTimeout(flush, 120);
}
addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); flush(); } });
addEventListener('visibilitychange', () => { if (document.hidden && timer) { clearTimeout(timer); flush(); } });

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// A one-slot local safety net taken right before anything destructive (reset,
// import, restore). It cannot survive the browser wiping this origin's storage
// entirely, but it turns a fat-fingered tap or the wrong file into a one-tap
// "Restore" instead of a real loss.
export function snapshotRecovery(reason) {
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ at: Date.now(), reason, data: state }));
  } catch { /* best-effort: storage full is not worth failing the action for */ }
}

export function getRecoverySnapshot() {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || !snap.data || !Array.isArray(snap.data.habits)) return null;
    return snap;
  } catch {
    return null;
  }
}

export function touchHabits() {
  state.habitsVersion = (state.habitsVersion || 0) + 1;
}

export function needsBackup() {
  return state.habits.length > 0 && (state.habitsVersion || 0) !== (state.backedUpAtVersion ?? -1);
}

export function markBackedUp(at = Date.now()) {
  state.lastBackupAt = at;
  state.backedUpAtVersion = state.habitsVersion || 0;
  save();
}

export function resetAll() {
  snapshotRecovery('reset');
  const lang = state.lang;
  state = defaults();
  state.lang = lang;
  flush();
}

// The file records its own creation as the last backup, so a later import can
// say "made 3 days ago" about the file itself rather than about the backup before it.
export function exportJSON(at = Date.now()) {
  return JSON.stringify({ ...state, lastBackupAt: at, backedUpAtVersion: state.habitsVersion || 0 }, null, 2);
}

export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || !Array.isArray(s.habits)) throw new Error('bad');
  snapshotRecovery('import');
  state = mergeWithDefaults(s);
  flush();
}

export function restoreSnapshot(data) {
  state = mergeWithDefaults(data);
  flush();
}

// Drops day records older than 45 days to keep storage tiny.
export function pruneDays(todayKey) {
  const keys = Object.keys(state.days).sort();
  while (keys.length > 45) delete state.days[keys.shift()];
  void todayKey;
}
