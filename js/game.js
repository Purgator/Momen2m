// Gamification, read side: levels, ranks, statistics, badges and tips — all
// derived from the state the engine already keeps. Pure functions (plus one
// tiny writer, unlockBadges) so the whole thing is testable under Node.
import { state, save, needsBackup } from './store.js';
import { levelFor, xpForLevel, dayComplete, todayPoints } from './engine.js';
import { dayKey, addDays } from './time.js';
import { permission } from './notify.js';

export const LEVELS_PER_RANK = 2;
export const HISTORY_DAYS = 30;

// Level, rank index and progress towards the next level, for a given xp.
export function levelInfo(xp, rankCount = 8) {
  const level = levelFor(xp);
  const lo = xpForLevel(level), hi = xpForLevel(level + 1);
  return {
    xp, level, lo, hi,
    toNext: hi - xp,
    pct: Math.max(0, Math.min(100, Math.round(((xp - lo) / (hi - lo)) * 100))),
    rankIdx: Math.min(rankCount - 1, Math.floor((level - 1) / LEVELS_PER_RANK)),
  };
}

// First level of each rank, for the ladder shown in the level sheet.
export function rankLadder(rankCount = 8) {
  const out = [];
  for (let i = 0; i < rankCount; i++) out.push({ rankIdx: i, fromLevel: i * LEVELS_PER_RANK + 1, fromXp: xpForLevel(i * LEVELS_PER_RANK + 1) });
  return out;
}

const habitIdOf = (occKey) => occKey.slice(0, occKey.lastIndexOf('#'));

// Everything the Progress tab and the badges need, in one pass over the last
// HISTORY_DAYS days of records. `todayOccs` are the engine's occurrences for
// today (already built by the controller), used for "N left today".
// Identity of a moment for people, not for the engine: same emoji and name
// (any language, any case) means the same thing, whether it repeats or was a
// one-off. Statistics merge on it; creation refuses a duplicate of its own kind.
export function momentKey(h) {
  const name = typeof h.name === 'object' ? (h.name.en || Object.values(h.name)[0] || '') : h.name;
  return (h.emoji || '').trim() + ' ' + String(name).trim().toLowerCase();
}

// Another moment with the same key and the same kind (repeating vs one-time).
// A repeating "Read" and a one-time "Read" may coexist.
export function nameConflict(h, list = state.habits) {
  const key = momentKey(h), once = !!h.once;
  return list.find((x) => x.id !== h.id && !!x.once === once && momentKey(x) === key) || null;
}

export function computeStats(now, todayOccs = []) {
  const today = dayKey(new Date(now));
  const g = state.game;
  const habits = new Map(state.habits.map((h) => [h.id, h]));
  const perHabit = new Map(); // keyed by momentKey: a recurring and a one-time "Read" count as one
  const history = [];
  let done = 0, missed = 0, skipped = 0, early = 0, snoozes = 0, dawn = 0, night = 0, weekend = 0;
  const distinct = new Set();
  let bestDay = null;

  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    const recs = state.days[day] || {};
    const d = { day, done: 0, missed: 0, skipped: 0, pts: 0, snoozes: 0, perfect: null };
    for (const key in recs) {
      const r = recs[key];
      d.pts += r.pts || 0;
      d.snoozes += r.snoozes || 0;
      if (r.status === 'done') {
        d.done++;
        if (r.early) early++;
        if (r.at) { const h = new Date(r.at).getHours(); if (h < 7) dawn++; if (h >= 22 || h < 4) night++; }
        if ([0, 6].includes(new Date(day + 'T12:00').getDay())) weekend++;
        distinct.add(habitIdOf(key));
      } else if (r.status === 'missed') d.missed++;
      else if (r.status === 'skipped') d.skipped++;
      if (r.status !== 'open') {
        const hid = habitIdOf(key);
        const h = habits.get(hid);
        if (h) {
          const mk = momentKey(h);
          const p = perHabit.get(mk) || { habit: h, done: 0, missed: 0, skipped: 0 };
          p[r.status]++;
          perHabit.set(mk, p);
        }
      }
    }
    if (day < today) d.perfect = dayComplete(day);
    done += d.done; missed += d.missed; skipped += d.skipped; snoozes += d.snoozes;
    if (d.done && (!bestDay || d.pts > bestDay.pts)) bestDay = { day, pts: d.pts };
    history.push(d);
  }

  const resolved = done + missed + skipped;
  const perHabitList = [...perHabit.values()].map((p) => {
    const n = p.done + p.missed + p.skipped;
    return { ...p, total: n, rate: n ? p.done / n : null };
  }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.total - a.total);

  const todays = todayOccs.filter((o) => o.day === today);
  const todayDone = todays.filter((o) => o.status === 'done').length;
  const todayResolved = todays.filter((o) => o.status !== 'open').length;

  let comeback = false;
  for (let i = 0; i + 1 < history.length; i++) if (history[i].missed > 0 && history[i + 1].perfect === true) { comeback = true; break; }

  return {
    level: levelInfo(g.xp),
    lifetime: { done: g.done || 0, missed: g.missed || 0, early: g.early || 0, shares: g.shares || 0, recovered: g.recovered || 0, onceDone: g.onceDone || 0 },
    streak: g.streak || 0, bestStreak: g.bestStreak || 0,
    history, week: history.slice(-7),
    period: { done, missed, skipped, resolved, rate: resolved ? done / resolved : null, early, snoozes, bestDay, dawn, night, weekend, distinct: distinct.size, comeback },
    perHabit: perHabitList,
    today: { total: todays.length, done: todayDone, resolved: todayResolved, left: todays.length - todayResolved, pts: todayPoints(now) },
  };
}

// ---- badges ----------------------------------------------------------------------
// `goal` returns [current, target]; a badge is earned when current >= target.
// Names and descriptions live in i18n under badgeNames / badgeDescs.
export const BADGES = [
  { id: 'first', emoji: '🌱', goal: (s) => [s.lifetime.done, 1] },
  { id: 'ten', emoji: '🔟', goal: (s) => [s.lifetime.done, 10] },
  { id: 'fifty', emoji: '🎯', goal: (s) => [s.lifetime.done, 50] },
  { id: 'hundred', emoji: '💯', goal: (s) => [s.lifetime.done, 100] },
  { id: 'fivehundred', emoji: '🏆', goal: (s) => [s.lifetime.done, 500] },
  { id: 'early', emoji: '⚡', goal: (s) => [s.lifetime.early, 10] },
  { id: 'perfect', emoji: '🌟', goal: (s) => [Math.min(1, s.bestStreak), 1] },
  { id: 'streak3', emoji: '🔥', goal: (s) => [s.bestStreak, 3] },
  { id: 'streak7', emoji: '🗓️', goal: (s) => [s.bestStreak, 7] },
  { id: 'streak30', emoji: '👑', goal: (s) => [s.bestStreak, 30] },
  { id: 'level5', emoji: '⭐', goal: (s) => [s.level.level, 5] },
  { id: 'level10', emoji: '💎', goal: (s) => [s.level.level, 10] },
  { id: 'dawn', emoji: '🌅', goal: (s) => [s.period.dawn, 5] },
  { id: 'night', emoji: '🌙', goal: (s) => [s.period.night, 5] },
  { id: 'variety', emoji: '🎨', goal: (s) => [s.period.distinct, 5] },
  { id: 'comeback', emoji: '💪', goal: (s) => [s.period.comeback ? 1 : 0, 1] },
  { id: 'sharer', emoji: '📣', goal: (s) => [s.lifetime.shares, 1] },
  { id: 'twohundred', emoji: '🎖️', goal: (s) => [s.lifetime.done, 200] },
  { id: 'thousand', emoji: '🏛️', goal: (s) => [s.lifetime.done, 1000] },
  { id: 'streak14', emoji: '📅', goal: (s) => [s.bestStreak, 14] },
  { id: 'streak100', emoji: '🌈', goal: (s) => [s.bestStreak, 100] },
  { id: 'level20', emoji: '🚀', goal: (s) => [s.level.level, 20] },
  { id: 'early50', emoji: '🐦', goal: (s) => [s.lifetime.early, 50] },
  { id: 'recovered', emoji: '🩹', goal: (s) => [s.lifetime.recovered, 5] },
  { id: 'oneoff', emoji: '⚡', goal: (s) => [s.lifetime.onceDone, 10] },
  { id: 'weekend', emoji: '🛋️', goal: (s) => [s.period.weekend, 10] },
  { id: 'nosnooze', emoji: '🧘', goal: (s) => [s.period.done >= 20 && s.period.snoozes === 0 ? 1 : 0, 1] },
];
export const BADGE_PAGE = 9;

export function badgeProgress(b, s) {
  const [n, of] = b.goal(s);
  const unlockedAt = (state.game.badges || {})[b.id] || 0;
  return { n: Math.min(n, of), of, earned: !!unlockedAt || n >= of, unlockedAt };
}

// Persists newly earned badges (so they survive pruned history and undo) and
// returns them, oldest-defined first, for the celebration toasts.
export function unlockBadges(s, now = Date.now()) {
  if (!state.game.badges) state.game.badges = {};
  const fresh = [];
  for (const b of BADGES) {
    if (state.game.badges[b.id]) continue;
    const [n, of] = b.goal(s);
    if (n >= of) { state.game.badges[b.id] = now; fresh.push(b); }
  }
  if (fresh.length) save();
  return fresh;
}

// ---- tips -----------------------------------------------------------------------
// Up to `max` contextual tips as { key, vars }, most useful first. Keys map to
// i18n strings; `name` vars are raw habit names (the UI localizes and escapes).
// ---- timing advice ---------------------------------------------------------------
// Looks at *when* each repeating moment actually gets done (r.at) over the
// last 30 days and suggests moving its window when the pattern is clear.
// Trust before helpfulness: at least `MIN_SAMPLES` completions, and the
// middle half of them within `MAX_SPREAD` minutes — otherwise say nothing.
export const ADVICE_MIN_SAMPLES = 7, ADVICE_MAX_SPREAD = 45;

const minutesOfDay = (ts) => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };
const r5 = (m) => Math.round(m / 5) * 5;
const hm = (m) => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

export function timingAdvice(now = Date.now(), days = 30) {
  const today = dayKey(new Date(now));
  const out = [];
  for (const h of state.habits) {
    if (h.once || h.enabled === false) continue;
    (h.slots || []).forEach((slot, i) => {
      const key = h.id + '#' + i;
      const startMin = parseHMLocal(slot.start), endMin = parseHMLocal(slot.end);
      const len = ((endMin - startMin) % 1440 + 1440) % 1440 || 1440;
      const offsets = [];
      for (let d = 0; d < days; d++) {
        const r = (state.days[addDays(today, -d)] || {})[key];
        if (r && r.status === 'done' && r.at && !r.late) {
          // Minutes relative to the window start, in [-720, 720).
          offsets.push(((minutesOfDay(r.at) - startMin + 720) % 1440 + 1440) % 1440 - 720);
        }
      }
      if (offsets.length < ADVICE_MIN_SAMPLES) return;
      offsets.sort((a, b) => a - b);
      const q = (p) => offsets[Math.min(offsets.length - 1, Math.floor(p * offsets.length))];
      const median = q(0.5), spread = q(0.75) - q(0.25);
      if (spread > ADVICE_MAX_SPREAD) return;
      const early = offsets.filter((o) => o < 0).length / offsets.length;
      const late = offsets.filter((o) => o > len * 0.75).length / offsets.length;
      const vars = { name: h.name, emoji: h.emoji, from: slot.start, at: hm(startMin + median), n: offsets.length };
      // Done before the window opens, most of the time: start it where they actually do it.
      if (early >= 0.7) out.push({ key: 'adviceEarlier', vars: { ...vars, to: hm(r5(startMin + median - 10)) }, habitId: h.id, slot: i });
      // Squeezed into the last quarter: give it a later start (same length).
      else if (late >= 0.7) out.push({ key: 'adviceLater', vars: { ...vars, to: hm(r5(startMin + median - Math.round(len / 2))) }, habitId: h.id, slot: i });
    });
  }
  return out;
}
function parseHMLocal(s) { const [a, b] = s.split(':').map(Number); return a * 60 + (b || 0); }

export function tips(s, max = 3) {
  const out = [...timingAdvice()];
  const perm = permission();
  if (perm === 'default') out.push({ key: 'tipNotif' });
  if (needsBackup()) out.push({ key: 'tipBackup' });
  const hardest = s.perHabit.filter((p) => p.total >= 3 && p.rate !== null && p.rate < 0.5).sort((a, b) => a.rate - b.rate)[0];
  if (hardest) out.push({ key: 'tipHardest', vars: { name: hardest.habit.name, emoji: hardest.habit.emoji, pct: Math.round(hardest.rate * 100) } });
  if (s.period.snoozes >= 5) out.push({ key: 'tipSnooze', vars: { n: s.period.snoozes } });
  if (s.period.done >= 5 && s.period.early / s.period.done < 0.3) out.push({ key: 'tipEarly' });
  if (s.streak === 0 && s.bestStreak > 0) out.push({ key: 'tipStreakBack', vars: { n: s.bestStreak } });
  else if (s.streak > 0) out.push({ key: 'tipStreakKeep', vars: { n: s.streak } });
  if (s.today.left > 0) out.push({ key: 'tipLeftToday', vars: { n: s.today.left } });
  if (s.level.toNext <= 60) out.push({ key: 'tipNearLevel', vars: { n: s.level.toNext, l: s.level.level + 1 } });
  if (!out.length) out.push({ key: 'tipGeneric' });
  return out.slice(0, max);
}

// How many moments were completed in a row today, counting back from the
// latest resolved one — the "3 in a row!" combo.
export function todayCombo(todayOccs, now) {
  const today = dayKey(new Date(now));
  const resolved = todayOccs.filter((o) => o.day === today && o.status !== 'open' && o.at).sort((a, b) => a.at - b.at);
  let n = 0;
  for (let i = resolved.length - 1; i >= 0; i--) { if (resolved[i].status === 'done') n++; else break; }
  return n;
}
