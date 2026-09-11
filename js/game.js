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
export function computeStats(now, todayOccs = []) {
  const today = dayKey(new Date(now));
  const g = state.game;
  const habits = new Map(state.habits.map((h) => [h.id, h]));
  const perHabit = new Map();
  const history = [];
  let done = 0, missed = 0, skipped = 0, early = 0, snoozes = 0, dawn = 0, night = 0;
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
        distinct.add(habitIdOf(key));
      } else if (r.status === 'missed') d.missed++;
      else if (r.status === 'skipped') d.skipped++;
      if (r.status !== 'open') {
        const hid = habitIdOf(key);
        const h = habits.get(hid);
        if (h) {
          const p = perHabit.get(hid) || { habit: h, done: 0, missed: 0, skipped: 0 };
          p[r.status]++;
          perHabit.set(hid, p);
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
    lifetime: { done: g.done || 0, missed: g.missed || 0, early: g.early || 0, shares: g.shares || 0 },
    streak: g.streak || 0, bestStreak: g.bestStreak || 0,
    history, week: history.slice(-7),
    period: { done, missed, skipped, resolved, rate: resolved ? done / resolved : null, early, snoozes, bestDay, dawn, night, distinct: distinct.size, comeback },
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
];

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
export function tips(s, max = 3) {
  const out = [];
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
