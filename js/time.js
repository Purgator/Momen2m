// Date and time helpers. All computations are in local time.
const pad = (n) => (n < 10 ? '0' : '') + n;

export function dayKey(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function dayStart(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = dayStart(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function weekday(key) {
  return dayStart(key).getDay();
}

export function parseHM(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function nowHM(d = new Date()) {
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export function minutesToHM(min) {
  min = ((min % 1440) + 1440) % 1440;
  return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
}

// Timestamp of `hm` on day `key` (plus optional day offset).
export function at(key, hm, dayOffset = 0) {
  const d = dayStart(key);
  const [h, m] = hm.split(':').map(Number);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

// Clock format follows the device locale (12h/24h), not the UI language.
const clockFmt = new Intl.DateTimeFormat(navigator.language || 'en', { hour: '2-digit', minute: '2-digit' });
export function fmtClock(ts) {
  return clockFmt.format(ts);
}

// Exact moment, to the second: "11 Sept 2026, 14:05:33" (device locale).
const dateTimeFmt = new Intl.DateTimeFormat(navigator.language || 'en', { dateStyle: 'medium', timeStyle: 'medium' });
const timeSecFmt = new Intl.DateTimeFormat(navigator.language || 'en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function fmtDateTime(ts) {
  return dateTimeFmt.format(ts);
}
// Same, but drops the date when it is today ("14:05:33"): fits on a button.
export function fmtWhenShort(ts) {
  return dayKey(new Date(ts)) === dayKey() ? timeSecFmt.format(ts) : dateTimeFmt.format(ts);
}

// Filesystem-safe timestamp for backup names: "2026-09-11_14-05-33". To the
// second, so two exports the same day never overwrite each other.
export function fileStamp(d = new Date()) {
  return dayKey(d) + '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
}

// Countdown such as "12:34" (under an hour) or "1:05:09".
export function fmtCountdown(ms) {
  if (ms < 0) ms = 0;
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
}

// Rough duration such as "25 min" or "2 h 05".
export function fmtDuration(ms, lang) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  return r ? h + ' h ' + pad(r) : h + ' h';
}

// Relative time such as "today", "3 days ago" or "2 weeks ago", localized via
// Intl (well supported on every platform this app targets). `ts` is 0/falsy
// for "never" — callers check that themselves.
export function fmtAgo(ts, lang) {
  const days = Math.floor((Date.now() - ts) / 86400000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (days <= 0) return rtf.format(0, 'day');
  if (days < 7) return rtf.format(-days, 'day');
  if (days < 30) return rtf.format(-Math.round(days / 7), 'week');
  return rtf.format(-Math.round(days / 30), 'month');
}
