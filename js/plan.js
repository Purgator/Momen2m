// The reminder plan handed to the push relay: every notification the app
// itself would show over the coming days, as absolute times and final texts,
// so the relay needs no logic of its own — it only has to be on time.
// Mirrors the rules in engine.tick(): start, "before the end" warning (only
// when the window is long enough), and missed.
import { state } from './store.js';
import { occurrencesOfDay, BASE_PTS, canSnooze } from './engine.js';
import { t, pick } from './i18n.js';
import { isStrong, vibrationPattern } from './notify.js';
import { dayKey, addDays, fmtDuration } from './time.js';

export const PLAN_DAYS = 7;
export const PLAN_MAX = 600;

export function buildPlan(now, days = PLAN_DAYS) {
  const s = state.settings;
  if (!s.notifications) return [];
  const today = dayKey(new Date(now));
  const before = (s.reminderBefore || 0) * 60000;
  const silent = !s.sound; // in-app sound cannot play while the app is closed: use the system sound unless sound is off entirely
  const items = [];
  const push = (o, at, kind, title, body, actions) => {
    if (at <= now + 2000) return; // the app handles anything already due
    const strong = isStrong(o.habit.importance);
    items.push({
      at, kind, tag: o.key, title, body, strong, silent, // key defaults to tag on the relay
      vibrate: s.vibrate && !silent ? vibrationPattern(strong) : [],
      actions: actions || [],
    });
  };
  for (let i = -1; i < days; i++) {
    const day = addDays(today, i);
    for (const o of occurrencesOfDay(day)) {
      if (o.status !== 'open' || o.end <= now) continue;
      const name = pick(o.habit.name);
      const emoji = o.habit.emoji;
      const pts = BASE_PTS[o.habit.importance] || 20;
      const actions = [{ action: 'done', title: '✓ ' + t('done') }];
      if (canSnooze(o) === 'ok') actions.push({ action: 'snooze', title: '💤 ' + t('snoozeMin', { n: s.snoozeMinutes }) });
      push(o, o.start, 'start', t('nStart', { emoji, name }), t('nStartBody', { t: fmtDuration(o.end - o.start, state.lang), pts }), actions);
      if (before > 0 && o.end - o.start > before * 2) {
        push(o, o.end - before, 'ending', t('nStart', { emoji, name }), t('nEndingBody', { t: fmtDuration(before, state.lang) }), actions);
      }
      push(o, o.end, 'missed', t('nMissed', { name }), t('nMissedBody'));
    }
  }
  items.sort((a, b) => a.at - b.at);
  return items.slice(0, PLAN_MAX);
}
