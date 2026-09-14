// Pure scheduling helpers for the Device durable object, kept apart so they
// can be unit-tested under Node without the Workers runtime.

export const MAX_ITEMS = 400;          // a week of moments for a busy schedule
export const MAX_BODY_BYTES = 64 * 1024;
export const STALE_AFTER = 8 * 86400000; // stop pushing if the app hasn't synced for this long
export const LATE_GRACE = 15 * 60000;    // an alarm that fires this late still sends (relay hiccup)
export const MAX_AHEAD = 60 * 86400000;  // the app plans a week; anything further is a bug or abuse

// Validates and normalises what the app uploads. Throws on anything off.
export function normaliseSchedule(items, now = Date.now()) {
  if (!Array.isArray(items)) throw new Error('schedule must be an array');
  if (items.length > MAX_ITEMS) throw new Error('too many items');
  const out = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') throw new Error('bad item');
    const at = Number(it.at);
    if (!Number.isFinite(at) || at <= 0 || at > now + MAX_AHEAD) throw new Error('bad time');
    const title = String(it.title || '').slice(0, 120);
    const body = String(it.body || '').slice(0, 300);
    const tag = String(it.tag || '').slice(0, 120);
    if (!title || !tag) throw new Error('title and tag required');
    out.push({
      at, title, body, tag,
      key: String(it.key || tag).slice(0, 120),
      kind: ['start', 'ending', 'missed'].includes(it.kind) ? it.kind : 'start',
      strong: !!it.strong,
      silent: !!it.silent,
      actions: Array.isArray(it.actions) ? it.actions.slice(0, 2).map((a) => ({ action: String(a.action).slice(0, 20), title: String(a.title).slice(0, 40) })) : [],
    });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

export function validateSubscription(sub) {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint)) throw new Error('bad endpoint');
  if (!sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') throw new Error('bad keys');
  return { endpoint: sub.endpoint, expirationTime: sub.expirationTime || null, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
}

// Splits the schedule into what is due now (within grace) and what remains.
// Items older than the grace window are dropped silently: a very late reminder
// is worse than none, the app settles misses itself.
export function splitDue(schedule, now, grace = LATE_GRACE) {
  const due = [], rest = [];
  for (const it of schedule) {
    if (it.at <= now) { if (now - it.at <= grace) due.push(it); }
    else rest.push(it);
  }
  return { due, rest };
}

export function nextAlarm(schedule) {
  return schedule.length ? schedule[0].at : null;
}
