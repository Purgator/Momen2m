// Persistent state in localStorage. Small, synchronous, survives offline.
import { detectLang } from './i18n.js';

const KEY = 'momen2m.v1';

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
      snoozeAllowed: true,
      snoozeMinutes: 10,
      maxSnoozes: 2,
    },
    habits: [],
    days: {},               // dayKey -> occKey -> record
    game: { xp: 0, streak: 0, bestStreak: 0, lastEvaluated: null, done: 0, missed: 0 },
    lastSeen: Date.now(),
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const s = JSON.parse(raw);
    const d = defaults();
    return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) }, game: { ...d.game, ...(s.game || {}) } };
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

export function resetAll() {
  const lang = state.lang;
  state = defaults();
  state.lang = lang;
  flush();
}

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || !Array.isArray(s.habits)) throw new Error('bad');
  const d = defaults();
  state = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) }, game: { ...d.game, ...(s.game || {}) } };
  flush();
}

// Drops day records older than 45 days to keep storage tiny.
export function pruneDays(todayKey) {
  const keys = Object.keys(state.days).sort();
  while (keys.length > 45) delete state.days[keys.shift()];
  void todayKey;
}
