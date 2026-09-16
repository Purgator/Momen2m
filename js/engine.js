// The heart of the app: turns habits into today's occurrences, tracks their
// status, marks misses, and keeps the score.
import { state, save, pruneDays } from './store.js';
import { dayKey, addDays, weekday, at, parseHM } from './time.js';

export const BASE_PTS = { 1: 10, 2: 20, 3: 30 };
export const SNOOZE_PENALTY = 3;
const RECENT = 15 * 60 * 1000; // only notify for transitions younger than this

const occKey = (habitId, slotIndex) => habitId + '#' + slotIndex;

function record(day, key, create) {
  let d = state.days[day];
  if (!d) { if (!create) return null; d = state.days[day] = {}; }
  let r = d[key];
  if (!r && create) r = d[key] = { status: 'open', snoozes: 0, pts: 0 };
  return r || null;
}

function habitOnDay(h, day) {
  if (h.enabled === false) return false;
  if (h.once) return h.once === day;
  return (h.days || []).includes(weekday(day));
}

// Raw occurrences of one day (no phase computed).
export function occurrencesOfDay(day) {
  const list = [];
  for (const h of state.habits) {
    if (!habitOnDay(h, day)) continue;
    (h.slots || []).forEach((slot, i) => {
      const start = at(day, slot.start);
      const originalEnd = at(day, slot.end, parseHM(slot.end) <= parseHM(slot.start) ? 1 : 0);
      if (h.createdAt && originalEnd <= h.createdAt) return; // window ended before the moment existed
      const key = occKey(h.id, i);
      const rec = record(day, key, false);
      list.push({
        key: day + '|' + key, day, occ: key, habit: h, slot: i,
        start: rec && rec.start ? rec.start : start,
        originalEnd, end: rec && rec.deadline ? rec.deadline : originalEnd,
        status: rec ? rec.status : 'open', snoozes: rec ? rec.snoozes : 0, pts: rec ? rec.pts || 0 : 0,
        at: rec ? rec.at : 0, late: !!(rec && rec.late),
      });
    });
  }
  return list;
}

function phaseOf(o, now) {
  if (o.status !== 'open') return 'past';
  if (now >= o.end) return 'past';
  if (now >= o.start) return 'active';
  return 'upcoming';
}

// Occurrences worth showing right now: today's, plus yesterday's that cross midnight.
export function buildOccurrences(now) {
  const today = dayKey(new Date(now));
  const startOfToday = at(today, '00:00');
  const list = occurrencesOfDay(today);
  for (const o of occurrencesOfDay(addDays(today, -1))) {
    if (o.end > startOfToday) list.push(o);
  }
  for (const o of list) o.phase = phaseOf(o, now);
  list.sort((a, b) => a.start - b.start || a.end - b.end);
  return list;
}

export function currentOf(list) {
  let best = null;
  for (const o of list) if (o.phase === 'active' && (!best || o.end < best.end)) best = o;
  return best;
}

function applyXp(delta) {
  state.game.xp = Math.max(0, state.game.xp + delta);
}

function markMisses(day, now, hooks) {
  let changed = false;
  for (const o of occurrencesOfDay(day)) {
    if (o.status !== 'open' || now < o.end) continue;
    const rec = record(day, o.occ, true);
    rec.status = 'missed';
    const pen = -BASE_PTS[o.habit.importance] || -20;
    rec.pts = (rec.pts || 0) + pen;
    rec.at = now;
    applyXp(pen);
    state.game.missed++;
    changed = true;
    if (hooks && now - o.end < RECENT) hooks.onMissed(o, pen);
  }
  return changed;
}

export function dayComplete(day) {
  const occs = occurrencesOfDay(day);
  if (!occs.length) return null;
  return occs.every((o) => o.status === 'done');
}

function lastDeadline(day) {
  let max = 0;
  for (const o of occurrencesOfDay(day)) if (o.end > max) max = o.end;
  return max;
}

// Settles fully elapsed past days: marks misses and updates the streak.
function settlePastDays(now) {
  const today = dayKey(new Date(now));
  const g = state.game;
  let day = g.lastEvaluated ? addDays(g.lastEvaluated, 1) : today;
  if (!g.lastEvaluated) { g.lastEvaluated = addDays(today, -1); return false; }
  const floor = addDays(today, -45);
  if (day < floor) day = floor;
  let changed = false;
  while (day < today) {
    if (lastDeadline(day) > now) break; // still has a window crossing into today
    markMisses(day, now, null);
    const complete = dayComplete(day);
    if (complete === true) { g.streak++; if (g.streak > g.bestStreak) g.bestStreak = g.streak; }
    else if (complete === false) g.streak = 0;
    g.lastEvaluated = day;
    changed = true;
    day = addDays(day, 1);
  }
  return changed;
}

// Advances the world to `now`. Returns true when something visible changed.
export function tick(now, hooks) {
  const today = dayKey(new Date(now));
  let changed = settlePastDays(now);
  for (const day of [addDays(today, -1), today]) changed = markMisses(day, now, hooks) || changed;

  const before = (state.settings.reminderBefore || 0) * 60000;
  for (const o of occurrencesOfDay(today).concat(occurrencesOfDay(addDays(today, -1)))) {
    if (o.status !== 'open' || now < o.start || now >= o.end) continue;
    const rec = record(o.day, o.occ, true);
    if (!rec.nStart) {
      rec.nStart = true;
      changed = true;
      if (now - o.start < RECENT) hooks.onStart(o);
    }
    if (before > 0 && !rec.nEnd && o.end - now <= before && o.end - o.start > before * 2) {
      rec.nEnd = true;
      hooks.onEnding(o);
    }
  }
  if (changed) { pruneDays(today); save(); }
  state.lastSeen = now;
  return changed;
}

// ---- user actions -----------------------------------------------------------

export function complete(o, now) {
  const rec = record(o.day, o.occ, true);
  if (rec.status !== 'open') return null;
  const base = BASE_PTS[o.habit.importance] || 20;
  const early = now <= o.start + (o.originalEnd - o.start) / 2;
  const pts = base + (early ? Math.round(base / 2) : 0);
  rec.status = 'done';
  rec.pts = (rec.pts || 0) + pts;
  rec.at = now;
  rec.early = early;
  applyXp(pts);
  state.game.done++;
  if (early) state.game.early = (state.game.early || 0) + 1;
  if (o.habit.once) state.game.onceDone = (state.game.onceDone || 0) + 1;
  const perfect = dayComplete(o.day) === true;
  save();
  return { pts, early, perfect };
}

export const LATE_WINDOW = 24 * 60 * 60 * 1000;

export function canCompleteLate(o, now) {
  return o.status === 'missed' && now - o.end <= LATE_WINDOW;
}

// A missed moment done within a day still counts: the penalty is lifted and
// a quarter of the base points is earned, so it ends slightly positive
// instead of at -base. Snooze penalties stay.
export function completeLate(o, now) {
  const rec = record(o.day, o.occ, false);
  if (!rec || !canCompleteLate({ ...o, status: rec.status }, now)) return null;
  const base = BASE_PTS[o.habit.importance] || 20;
  const snoozePts = -rec.snoozes * SNOOZE_PENALTY;
  const target = snoozePts + Math.round(base / 4);
  const delta = target - (rec.pts || 0);
  rec.status = 'done';
  rec.late = true;
  rec.early = false;
  rec.pts = target;
  rec.at = now;
  applyXp(delta);
  state.game.done++;
  state.game.missed = Math.max(0, (state.game.missed || 0) - 1);
  state.game.recovered = (state.game.recovered || 0) + 1;
  if (o.habit.once) state.game.onceDone = (state.game.onceDone || 0) + 1;
  save();
  return { pts: delta };
}

export function canSnooze(o) {
  if (!state.settings.snoozeAllowed) return 'disabled';
  if (o.habit.snooze === false) return 'disabled';
  if (o.snoozes >= state.settings.maxSnoozes) return 'exhausted';
  return 'ok';
}

// Snoozing pushes the whole remaining window back by the snooze length: the
// moment leaves the screen, sits in "Coming up", and pops up again (with a
// fresh start notification) when the snooze is over.
export function snooze(o, now) {
  if (canSnooze(o) !== 'ok') return null;
  const rec = record(o.day, o.occ, true);
  if (rec.status !== 'open') return null;
  const shift = state.settings.snoozeMinutes * 60000;
  rec.snoozes++;
  rec.start = now + shift;
  rec.deadline = Math.max(o.end, now) + shift;
  rec.nStart = false;
  rec.nEnd = false;
  rec.pts = (rec.pts || 0) - SNOOZE_PENALTY;
  applyXp(-SNOOZE_PENALTY);
  save();
  return { pts: -SNOOZE_PENALTY, start: rec.start, deadline: rec.deadline };
}

export function skip(o, now) {
  const rec = record(o.day, o.occ, true);
  if (rec.status !== 'open') return null;
  const pen = -Math.round((BASE_PTS[o.habit.importance] || 20) / 2);
  rec.status = 'skipped';
  rec.pts = (rec.pts || 0) + pen;
  rec.at = now;
  applyXp(pen);
  save();
  return { pts: pen };
}

// Reverts a done/skipped occurrence back to open (mis-tap protection).
export function undo(o) {
  const rec = record(o.day, o.occ, false);
  if (!rec || rec.status === 'open' || rec.status === 'missed') return false;
  if (rec.status === 'done') {
    state.game.done = Math.max(0, state.game.done - 1);
    if (rec.early) state.game.early = Math.max(0, (state.game.early || 0) - 1);
  }
  rec.early = false;
  // Snooze penalties stay; only the done/skip points are reverted.
  const snoozePts = -rec.snoozes * SNOOZE_PENALTY;
  applyXp(-((rec.pts || 0) - snoozePts));
  rec.pts = snoozePts;
  rec.status = 'open';
  rec.at = 0;
  save();
  return true;
}

// ---- score helpers ----------------------------------------------------------

export function levelFor(xp) {
  return Math.floor(Math.sqrt(xp / 60)) + 1;
}
export function xpForLevel(level) {
  return 60 * (level - 1) * (level - 1);
}
export function todayPoints(now) {
  const d = state.days[dayKey(new Date(now))];
  let sum = 0;
  if (d) for (const k in d) sum += d[k].pts || 0;
  return sum;
}
